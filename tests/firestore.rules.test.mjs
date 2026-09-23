import fs from "node:fs";
import test from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";

const projectId = "demo-project";

async function createEnvironment() {
  return initializeTestEnvironment({
    projectId: "demo-ai-web-factory",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: fs.readFileSync("firestore.rules", "utf8")
    }
  });
}

function baseProject(ownerId) {
  return {
    owner_id: ownerId,
    project_code: "AWF-TEST-0001",
    project_name: "Firebase Security Test",
    request_details: "test",
    status: "新規",
    priority: "通常",
    final_confirmation: 0,
    workflow_approvals: {},
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };
}

test("ownerだけが案件を読める", async () => {
  const env = await createEnvironment();

  try {
    const ownerDb = env.authenticatedContext("owner-a").firestore();
    const otherDb = env.authenticatedContext("owner-b").firestore();
    const ownerRef = doc(ownerDb, "projects", projectId);
    const otherRef = doc(otherDb, "projects", projectId);

    await assertSucceeds(setDoc(ownerRef, baseProject("owner-a")));
    await assertSucceeds(getDoc(ownerRef));
    await assertFails(getDoc(otherRef));
  } finally {
    await env.cleanup();
  }
});

test("工程飛ばしと承認なし制作開始・納品を拒否する", async () => {
  const env = await createEnvironment();

  try {
    const db = env.authenticatedContext("owner-a").firestore();
    const workflowProjectId = "workflow-project";
    const projectRef = doc(db, "projects", workflowProjectId);

    await assertSucceeds(setDoc(projectRef, baseProject("owner-a")));

    await assertFails(updateDoc(projectRef, {
      status: "制作中",
      updated_at: serverTimestamp()
    }));

    for (const status of ["AI分析中", "確認待ち", "制作待ち"]) {
      await assertSucceeds(updateDoc(projectRef, {
        status,
        updated_at: serverTimestamp()
      }));
    }

    await assertFails(updateDoc(projectRef, {
      status: "制作中",
      updated_at: serverTimestamp()
    }));

    const productionApproval = writeBatch(db);
    productionApproval.update(projectRef, {
      workflow_approvals: { production_start: "approved" },
      updated_at: serverTimestamp()
    });
    productionApproval.set(doc(db, "projects", workflowProjectId, "approvals", "production-start"), {
      owner_id: "owner-a",
      approval_type: "production_start",
      decision: "approved",
      note: "制作開始OK",
      created_at: serverTimestamp()
    });
    await assertSucceeds(productionApproval.commit());

    await assertSucceeds(updateDoc(projectRef, {
      status: "制作中",
      updated_at: serverTimestamp()
    }));

    for (const status of ["AI品質チェック", "ユーザー確認", "最終確認"]) {
      await assertSucceeds(updateDoc(projectRef, {
        status,
        updated_at: serverTimestamp()
      }));
    }

    await assertFails(updateDoc(projectRef, {
      status: "納品",
      delivered_at: serverTimestamp(),
      updated_at: serverTimestamp()
    }));

    const deliveryApproval = writeBatch(db);
    deliveryApproval.update(projectRef, {
      workflow_approvals: {
        production_start: "approved",
        final_delivery: "approved"
      },
      final_confirmation: 1,
      updated_at: serverTimestamp()
    });
    deliveryApproval.set(doc(db, "projects", workflowProjectId, "approvals", "final-delivery"), {
      owner_id: "owner-a",
      approval_type: "final_delivery",
      decision: "approved",
      note: "最終納品OK",
      created_at: serverTimestamp()
    });
    await assertSucceeds(deliveryApproval.commit());

    await assertSucceeds(updateDoc(projectRef, {
      status: "納品",
      delivered_at: serverTimestamp(),
      updated_at: serverTimestamp()
    }));
  } finally {
    await env.cleanup();
  }
});

test("owner_id変更や不正な重要承認を拒否する", async () => {
  const env = await createEnvironment();

  try {
    const db = env.authenticatedContext("owner-a").firestore();
    const invalidProjectId = "invalid-project";
    const projectRef = doc(db, "projects", invalidProjectId);

    await assertSucceeds(setDoc(projectRef, baseProject("owner-a")));

    await assertFails(updateDoc(projectRef, {
      owner_id: "owner-b",
      updated_at: serverTimestamp()
    }));

    const invalidApproval = writeBatch(db);
    invalidApproval.update(projectRef, {
      workflow_approvals: { final_delivery: "approved" },
      final_confirmation: 1,
      updated_at: serverTimestamp()
    });
    invalidApproval.set(doc(db, "projects", invalidProjectId, "approvals", "invalid-final"), {
      owner_id: "owner-a",
      approval_type: "final_delivery",
      decision: "approved",
      note: "",
      created_at: serverTimestamp()
    });

    await assertFails(invalidApproval.commit());
  } finally {
    await env.cleanup();
  }
});
