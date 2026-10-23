import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClerkClient } from "@clerk/backend";
import { createAdminClient, createClient } from "@insforge/sdk";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "phase2-test-fixtures.json");
const expectedClerkInstanceId = "ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI";
const expectedInsForgeProjectId = "988b987b-f809-4cd5-94b2-c1d1e5cc9120";
const requiredCapabilities = [
  "content.edit",
  "catalog.edit",
  "content.publish",
  "orders.manage",
  "staff.manage",
  "media.manage",
  "inquiries.manage",
];
const fileBucketName = "private-account-files";

class HarnessFailure extends Error {
  constructor(label) {
    super(label);
    this.name = "HarnessFailure";
    this.label = label;
  }
}

function ensure(condition, label) {
  if (!condition) throw new HarnessFailure(label);
}

function errorPresent(result) {
  return Boolean(result?.error);
}

function asArray(data) {
  return Array.isArray(data) ? data : [];
}

function normalizeUrl(value) {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

function parseArguments() {
  const args = new Set(process.argv.slice(2));
  ensure([...args].every((arg) => arg === "--keep-fixtures" || arg === "--cleanup"), "invalid_command_line");
  ensure(!(args.has("--keep-fixtures") && args.has("--cleanup")), "invalid_command_line");
  return { keepFixtures: args.has("--keep-fixtures"), cleanupOnly: args.has("--cleanup") };
}

async function preflight() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  ensure(typeof secretKey === "string" && secretKey.startsWith("sk_test_"), "development_clerk_key_required");

  const projectConfigPath = path.join(projectRoot, ".insforge", "project.json");
  let projectConfig;
  try {
    projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8"));
  } catch {
    throw new HarnessFailure("insforge_link_unavailable");
  }

  ensure(projectConfig.project_id === expectedInsForgeProjectId, "insforge_project_mismatch");
  const configuredBaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_INSFORGE_BASE_URL);
  const linkedBaseUrl = normalizeUrl(projectConfig.oss_host);
  ensure(configuredBaseUrl && linkedBaseUrl && configuredBaseUrl === linkedBaseUrl, "insforge_base_url_mismatch");
  ensure(typeof projectConfig.api_key === "string" && projectConfig.api_key.length > 0, "insforge_admin_key_unavailable");

  const clerk = createClerkClient({ secretKey });
  let instance;
  try {
    instance = await clerk.instance.get();
  } catch {
    throw new HarnessFailure("clerk_instance_check_failed");
  }
  ensure(instance.id === expectedClerkInstanceId, "clerk_instance_mismatch");

  const appBaseUrl = process.env.PHASE2_APP_BASE_URL?.trim() || "http://localhost:3000";
  let parsedAppBaseUrl;
  try {
    parsedAppBaseUrl = new URL(appBaseUrl);
  } catch {
    throw new HarnessFailure("invalid_local_app_url");
  }
  ensure(
    parsedAppBaseUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsedAppBaseUrl.hostname),
    "local_app_url_required",
  );

  return {
    clerk,
    baseUrl: configuredBaseUrl,
    admin: createAdminClient({ baseUrl: configuredBaseUrl, apiKey: projectConfig.api_key }),
    appOrigin: parsedAppBaseUrl.origin,
  };
}

function createRuntimeClient(baseUrl, accessToken, tokenProvider = null) {
  if (!tokenProvider) return createClient({ baseUrl, accessToken });

  const freshTokenFetch = async (input, init = {}) => {
    let token;
    try {
      token = await tokenProvider();
    } catch {
      throw new Error("Could not refresh the fixture session token.");
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    headers.set("authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  return createClient({ baseUrl, accessToken, fetch: freshTokenFetch });
}

function profileTable(client) {
  return client.database.schema("public").from("customer_profiles");
}

function staffTable(client) {
  return client.database.schema("public").from("staff_capabilities");
}

function accountFilesTable(client) {
  return client.database.schema("public").from("account_files");
}

async function adminStorageContains(context, key, failureLabel) {
  const listed = await context.admin.storage.from(fileBucketName).list({ prefix: key, limit: 10 });
  ensure(!listed.error, failureLabel);
  return asArray(listed.data?.data).some((object) => object.key === key);
}

async function safeJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new HarnessFailure(label);
  }
}

async function appRequest(appOrigin, route, token, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const resolvedToken = typeof token === "function" ? await token() : token;
  if (resolvedToken) headers.set("authorization", `Bearer ${resolvedToken}`);
  return fetch(new URL(route, appOrigin), { ...options, headers });
}

async function createFixtures(clerk, runId, onFixtureCreated) {
  const users = [];
  for (const role of ["customer", "staff"]) {
    const email = `${runId}.${role}+clerk_test@example.com`;
    let user;
    try {
      user = await clerk.users.createUser({
        emailAddress: [email],
        firstName: "Phase",
        lastName: role === "customer" ? "Customer" : "Staff",
        privateMetadata: { purpose: "phase2-isolation", runId },
        skipPasswordRequirement: true,
      });
    } catch {
      throw new HarnessFailure("fixture_user_creation_failed");
    }

    const fixture = { role, userId: user.id, email, sessionId: "", runId };
    users.push(fixture);
    onFixtureCreated?.(fixture);
    let session;
    try {
      session = await clerk.sessions.createSession({ userId: user.id });
    } catch {
      throw new HarnessFailure("fixture_session_creation_failed");
    }
    fixture.sessionId = session.id;
  }

  const auth = {};
  for (const fixture of users) {
    try {
      const insforgeToken = await clerk.sessions.getToken(fixture.sessionId, "insforge");
      ensure(Boolean(insforgeToken.jwt), "fixture_token_mint_failed");
      auth[fixture.role] = {
        database: createRuntimeClient(
          process.env.NEXT_PUBLIC_INSFORGE_BASE_URL.trim(),
          insforgeToken.jwt,
          async () => (await clerk.sessions.getToken(fixture.sessionId, "insforge")).jwt,
        ),
        appToken: async () => {
          const token = await clerk.sessions.getToken(fixture.sessionId);
          return token.jwt;
        },
        refreshDatabase: async () => {
          const token = await clerk.sessions.getToken(fixture.sessionId, "insforge");
          return createRuntimeClient(
            process.env.NEXT_PUBLIC_INSFORGE_BASE_URL.trim(),
            token.jwt,
            async () => (await clerk.sessions.getToken(fixture.sessionId, "insforge")).jwt,
          );
        },
      };
      if (fixture.role === "staff") auth.expiringInsforgeToken = insforgeToken.jwt;
    } catch (error) {
      if (error instanceof HarnessFailure) throw error;
      throw new HarnessFailure("fixture_token_mint_failed");
    }
  }

  return { users, auth };
}

async function verifyFixtureOwnership(clerk, fixture) {
  const match = typeof fixture?.email === "string"
    ? fixture.email.match(/^([0-9a-f-]{36})\.(customer|staff)\+clerk_test@example\.com$/i)
    : null;
  if (match) {
    fixture.runId = match[1];
    fixture.role = match[2].toLowerCase();
  }
  ensure(
    fixture &&
      typeof fixture.userId === "string" &&
      typeof fixture.email === "string" &&
      typeof fixture.sessionId === "string" &&
      ["customer", "staff"].includes(fixture.role),
    "invalid_fixture_record",
  );
  ensure(
    fixture.email.startsWith(`${fixture.runId}.`) &&
      fixture.email.endsWith("@example.com") &&
      /^[0-9a-f-]{36}$/i.test(fixture.runId ?? ""),
    "invalid_fixture_record",
  );

  let user;
  try {
    user = await clerk.users.getUser(fixture.userId);
  } catch {
    throw new HarnessFailure("fixture_ownership_check_failed");
  }
  ensure(
    user.privateMetadata?.purpose === "phase2-isolation" &&
      user.privateMetadata?.runId === fixture.runId &&
      user.emailAddresses.some((address) => address.emailAddress === fixture.email),
    "fixture_ownership_check_failed",
  );
}

async function cleanFixtures(context, fixtures, runId) {
  const userIds = fixtures.map(({ userId }) => userId);
  const cleanupFailures = [];

  for (const fixture of fixtures) {
    for (const capability of requiredCapabilities) {
      try {
        const { error } = await context.admin.database
          .schema("public")
          .rpc("set_staff_capability", {
            target_user_id: fixture.userId,
            capability_name: capability,
            enabled: false,
            reason: `phase2 fixture cleanup ${runId}`,
          });
        if (error) cleanupFailures.push("capability");
      } catch {
        cleanupFailures.push("capability");
      }
    }
  }

  for (const fixture of fixtures) {
    let metadata;
    try {
      metadata = await context.admin.database
        .schema("public")
        .from("account_files")
        .select("object_key")
        .eq("user_id", fixture.userId)
        .limit(1000);
      if (metadata.error) cleanupFailures.push("file_metadata_read");
    } catch {
      cleanupFailures.push("file_metadata_read");
    }

    const keys = new Set(asArray(metadata?.data).map((row) => row.object_key).filter((key) =>
      typeof key === "string" && key.startsWith(`${fixture.userId}/`),
    ));

    try {
      const listed = await context.admin.storage.from(fileBucketName).list({
        prefix: `${fixture.userId}/`,
        limit: 1000,
      });
      if (listed.error) cleanupFailures.push("file_storage_list");
      for (const object of asArray(listed.data?.data)) {
        if (typeof object.key === "string" && object.key.startsWith(`${fixture.userId}/`)) {
          keys.add(object.key);
        }
      }
    } catch {
      cleanupFailures.push("file_storage_list");
    }

    if (keys.size > 0) {
      try {
        const removed = await context.admin.storage.from(fileBucketName).remove([...keys]);
        if (removed.error) cleanupFailures.push("file_storage_remove");
      } catch {
        cleanupFailures.push("file_storage_remove");
      }
    }

    try {
      const deleted = await context.admin.database
        .schema("public")
        .from("account_files")
        .delete()
        .eq("user_id", fixture.userId);
      if (deleted.error) cleanupFailures.push("file_metadata_delete");
    } catch {
      cleanupFailures.push("file_metadata_delete");
    }

    try {
      const deleted = await context.admin.database
        .schema("public")
        .from("customer_profiles")
        .delete()
        .eq("user_id", fixture.userId);
      if (deleted.error) cleanupFailures.push("profile_delete");
    } catch {
      cleanupFailures.push("profile_delete");
    }
  }

  if (userIds.length > 0) {
    try {
      const events = await context.admin.database
        .schema("public")
        .from("staff_capability_events")
        .delete()
        .in("user_id", userIds);
      if (events.error) cleanupFailures.push("audit_cleanup");
    } catch {
      cleanupFailures.push("audit_cleanup");
    }
  }

  for (const fixture of fixtures) {
    try {
      await context.clerk.sessions.revokeSession(fixture.sessionId);
    } catch {
      // Deleting the fixture user below also revokes any remaining sessions.
    }
    try {
      await context.clerk.users.deleteUser(fixture.userId);
    } catch {
      cleanupFailures.push("clerk_user_delete");
    }
  }

  ensure(cleanupFailures.length === 0, "fixture_cleanup_failed");
}

async function saveFixtures(users) {
  await mkdir(path.dirname(fixturePath), { recursive: true });
  const stored = {
    users: users.map(({ userId, email, sessionId }) => ({ userId, email, sessionId })),
  };
  await writeFile(fixturePath, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

async function cleanupStoredFixtures(context) {
  let stored;
  try {
    stored = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch {
    throw new HarnessFailure("fixture_file_unavailable");
  }
  ensure(
    Array.isArray(stored.users) &&
      stored.users.length === 2,
    "invalid_fixture_file",
  );
  for (const fixture of stored.users) {
    await verifyFixtureOwnership(context.clerk, fixture);
  }
  const runIds = new Set(stored.users.map(({ runId }) => runId));
  const roles = new Set(stored.users.map(({ role }) => role));
  ensure(runIds.size === 1 && roles.size === 2, "invalid_fixture_file");
  await cleanFixtures(context, stored.users, [...runIds][0]);
  await unlink(fixturePath);
  return stored.users.length;
}

async function verifyProfileAndApi(context, fixtures, auth) {
  const customer = fixtures.find(({ role }) => role === "customer");
  const staff = fixtures.find(({ role }) => role === "staff");
  auth.customer.database = await auth.customer.refreshDatabase();
  auth.staff.database = await auth.staff.refreshDatabase();
  const customerDb = auth.customer.database;
  const staffDb = auth.staff.database;

  const insert = await profileTable(customerDb).insert([
    { user_id: customer.userId, display_name: "Owner profile" },
  ]).select("user_id,display_name,created_at").single();
  ensure(!insert.error && insert.data?.user_id === customer.userId, "profile_owner_insert_failed");

  const ownRead = await profileTable(customerDb)
    .select("user_id,display_name,created_at")
    .eq("user_id", customer.userId)
    .maybeSingle();
  ensure(!ownRead.error && ownRead.data?.display_name === "Owner profile", "profile_owner_read_failed");

  const ownUpdate = await profileTable(customerDb)
    .update({ display_name: "Owner direct update" })
    .eq("user_id", customer.userId)
    .select("user_id,display_name")
    .single();
  ensure(!ownUpdate.error && ownUpdate.data?.display_name === "Owner direct update", "profile_owner_update_failed");

  const crossRead = await profileTable(staffDb)
    .select("user_id,display_name")
    .eq("user_id", customer.userId)
    .maybeSingle();
  ensure(!crossRead.error && crossRead.data === null, "profile_cross_read_exposed");

  const crossUpdate = await profileTable(staffDb)
    .update({ display_name: "Cross-user mutation" })
    .eq("user_id", customer.userId)
    .select("user_id");
  ensure(!crossUpdate.error && asArray(crossUpdate.data).length === 0, "profile_cross_update_succeeded");

  const ownerIdMutation = await profileTable(customerDb)
    .update({ user_id: staff.userId })
    .eq("user_id", customer.userId)
    .select("user_id");
  ensure(errorPresent(ownerIdMutation), "profile_owner_id_mutation_allowed");

  const foreignInsert = await profileTable(customerDb).insert([
    { user_id: staff.userId, display_name: "Foreign insert" },
  ]);
  ensure(errorPresent(foreignInsert), "profile_foreign_insert_allowed");

  const forbiddenDelete = await profileTable(customerDb)
    .delete()
    .eq("user_id", customer.userId)
    .select("user_id");
  ensure(errorPresent(forbiddenDelete), "profile_delete_permission_granted");

  const anonProfileRead = await profileTable(createClient({ baseUrl: context.baseUrl }))
    .select("user_id")
    .eq("user_id", customer.userId);
  ensure(errorPresent(anonProfileRead), "anonymous_profile_read_allowed");

  const initialApiRead = await appRequest(context.appOrigin, "/api/account/profile", auth.customer.appToken);
  ensure(initialApiRead.status === 200, "profile_api_get_failed");
  const initialBody = await safeJson(initialApiRead, "profile_api_invalid_json");
  ensure(initialBody.profile?.display_name === "Owner direct update", "profile_api_get_shape_invalid");
  ensure(
    Object.keys(initialBody.profile).sort().join(",") === "created_at,display_name",
    "profile_api_exposed_extra_fields",
  );

  const patchHeaders = {
    origin: context.appOrigin,
    "content-type": "application/json",
  };
  const successfulPatch = await appRequest(context.appOrigin, "/api/account/profile", auth.customer.appToken, {
    method: "PATCH",
    headers: patchHeaders,
    body: JSON.stringify({ displayName: "Harness profile" }),
  });
  ensure(successfulPatch.status === 200, "profile_api_patch_failed");
  const patchedBody = await safeJson(successfulPatch, "profile_api_invalid_json");
  ensure(patchedBody.profile?.display_name === "Harness profile", "profile_api_patch_value_invalid");

  const massAssignment = await appRequest(context.appOrigin, "/api/account/profile", auth.customer.appToken, {
    method: "PATCH",
    headers: patchHeaders,
    body: JSON.stringify({ displayName: "Should reject", role: "staff", user_id: staff.userId }),
  });
  ensure(massAssignment.status === 400, "profile_api_mass_assignment_allowed");

  const oversizePatch = await appRequest(context.appOrigin, "/api/account/profile", auth.customer.appToken, {
    method: "PATCH",
    headers: patchHeaders,
    body: JSON.stringify({ displayName: "x".repeat(2048) }),
  });
  ensure(oversizePatch.status === 413, "profile_api_oversize_body_allowed");

  const crossOriginPatch = await appRequest(context.appOrigin, "/api/account/profile", auth.customer.appToken, {
    method: "PATCH",
    headers: { ...patchHeaders, origin: "https://untrusted.invalid" },
    body: JSON.stringify({ displayName: "Cross-origin" }),
  });
  ensure(crossOriginPatch.status === 403, "profile_api_cross_origin_allowed");

  const wrongContentType = await appRequest(context.appOrigin, "/api/account/profile", auth.customer.appToken, {
    method: "PATCH",
    headers: { origin: context.appOrigin, "content-type": "text/plain" },
    body: "{\"displayName\":\"wrong media type\"}",
  });
  ensure(wrongContentType.status === 415, "profile_api_wrong_content_type_allowed");

  try {
    await context.clerk.users.updateUserMetadata(customer.userId, {
      unsafeMetadata: { role: "admin", capabilities: ["content.edit", "staff.manage"] },
    });
  } catch {
    throw new HarnessFailure("unsafe_metadata_setup_failed");
  }
  const metadataStaffApi = await appRequest(context.appOrigin, "/api/staff/access", auth.customer.appToken);
  ensure(metadataStaffApi.status === 403, "unsafe_metadata_granted_staff_access");
}

async function verifyStaffAccess(context, fixtures, auth) {
  const customer = fixtures.find(({ role }) => role === "customer");
  const staff = fixtures.find(({ role }) => role === "staff");
  auth.customer.database = await auth.customer.refreshDatabase();
  auth.staff.database = await auth.staff.refreshDatabase();

  const customerApi = await appRequest(context.appOrigin, "/api/staff/access", auth.customer.appToken);
  ensure(customerApi.status === 403, "customer_staff_api_not_forbidden");

  const anonStaffRead = await staffTable(createClient({ baseUrl: context.baseUrl }) )
    .select("user_id,capability");
  ensure(errorPresent(anonStaffRead), "anonymous_staff_read_allowed");

  let grant;
  try {
    grant = await context.admin.database.schema("public").rpc("set_staff_capability", {
      target_user_id: staff.userId,
      capability_name: "content.edit",
      enabled: true,
      reason: `phase2 isolation fixture ${randomUUID()}`,
    });
  } catch {
    throw new HarnessFailure("staff_fixture_grant_failed");
  }
  ensure(!grant.error, "staff_fixture_grant_failed");

  const staffApi = await appRequest(context.appOrigin, "/api/staff/access", auth.staff.appToken);
  ensure(staffApi.status === 200, "staff_capability_api_denied");
  const staffApiBody = await safeJson(staffApi, "staff_api_invalid_json");
  ensure(
    staffApiBody.capability === "content.edit" &&
      staffApiBody.authorized === true &&
      Object.keys(staffApiBody).sort().join(",") === "authorized,capability",
    "staff_api_response_invalid",
  );

  const revoke = await context.admin.database.schema("public").rpc("set_staff_capability", {
    target_user_id: staff.userId,
    capability_name: "content.edit",
    enabled: false,
    reason: `phase2 isolation fixture revoke ${randomUUID()}`,
  });
  ensure(!revoke.error, "staff_fixture_revoke_failed");
  const revokedApi = await appRequest(context.appOrigin, "/api/staff/access", auth.staff.appToken);
  ensure(revokedApi.status === 403, "revoked_staff_capability_still_authorized");

  const regrant = await context.admin.database.schema("public").rpc("set_staff_capability", {
    target_user_id: staff.userId,
    capability_name: "content.edit",
    enabled: true,
    reason: `phase2 isolation fixture regrant ${randomUUID()}`,
  });
  ensure(!regrant.error, "staff_fixture_regrant_failed");
  const regrantedApi = await appRequest(context.appOrigin, "/api/staff/access", auth.staff.appToken);
  ensure(regrantedApi.status === 200, "regranted_staff_capability_denied");

  for (const [fixtureRole, client] of Object.entries({ customer: auth.customer.database, staff: auth.staff.database })) {
    for (const capability of requiredCapabilities) {
      const result = await client.database.schema("public").rpc("has_capability", {
        capability_name: capability,
      });
      ensure(!result.error, `capability_rpc_failed_${fixtureRole}`);
      const expected = fixtureRole === "staff" && capability === "content.edit";
      ensure(result.data === expected, `capability_result_wrong_${fixtureRole}`);
    }
  }

  const runtimeInsert = await staffTable(auth.staff.database).insert([
    { user_id: customer.userId, capability: "staff.manage", granted_by: staff.userId },
  ]);
  ensure(errorPresent(runtimeInsert), "runtime_staff_insert_allowed");

  const runtimeRpc = await auth.staff.database.database.schema("public").rpc("set_staff_capability", {
    target_user_id: staff.userId,
    capability_name: "orders.manage",
    enabled: true,
    reason: "runtime must not grant roles",
  });
  ensure(errorPresent(runtimeRpc), "runtime_staff_rpc_allowed");

  const customerAfterMetadata = await appRequest(context.appOrigin, "/api/staff/access", auth.customer.appToken);
  ensure(customerAfterMetadata.status === 403, "customer_gained_staff_access");
}

async function verifyPrivateFiles(context, fixtures, auth) {
  const customer = fixtures.find(({ role }) => role === "customer");
  const staff = fixtures.find(({ role }) => role === "staff");
  auth.customer.database = await auth.customer.refreshDatabase();
  auth.staff.database = await auth.staff.refreshDatabase();
  const customerDb = auth.customer.database;
  const staffDb = auth.staff.database;
  const ownerBucket = customerDb.storage.from(fileBucketName);
  const staffBucket = staffDb.storage.from(fileBucketName);
  const id = randomUUID();
  const key = `${customer.userId}/${id}.txt`;
  const content = "private owner file fixture\n";
  const blob = new Blob([content], { type: "text/plain" });

  let uploaded;
  try {
    uploaded = await ownerBucket.upload(key, blob);
  } catch {
    throw new HarnessFailure("owner_storage_upload_failed");
  }
  ensure(!uploaded.error && uploaded.data?.key === key && typeof uploaded.data?.url === "string", "owner_storage_upload_failed");

  const metadataInsert = await accountFilesTable(customerDb).insert([
    {
      id,
      user_id: customer.userId,
      object_key: key,
      storage_url: uploaded.data.url,
      filename: "harness-direct.txt",
      byte_size: Buffer.byteLength(content),
    },
  ]).select("id,filename,byte_size").single();
  ensure(!metadataInsert.error && metadataInsert.data?.id === id, "owner_file_metadata_insert_failed");

  const ownerList = await ownerBucket.list({ prefix: `${customer.userId}/`, limit: 100 });
  if (ownerList.error) {
    const status = Number.isSafeInteger(ownerList.error.status) ? ownerList.error.status : "unknown";
    throw new HarnessFailure(`owner_storage_list_request_failed_${status}`);
  }
  const prefixedObjects = asArray(ownerList.data?.data);
  const unfilteredOwnerList = await ownerBucket.list({ limit: 100 });
  ensure(!unfilteredOwnerList.error, "owner_storage_list_unfiltered_request_failed");
  const ownerObjects = asArray(unfilteredOwnerList.data?.data);
  ensure(
    ownerObjects.every((object) => typeof object.key === "string" && object.key.startsWith(`${customer.userId}/`)),
    "cross_user_storage_list_exposed",
  );
  const foundInOwnerList = prefixedObjects.some((object) => object.key === key) ||
    ownerObjects.some((object) => object.key === key);
  ensure(foundInOwnerList, "owner_storage_list_missing_file");

  const ownerDownload = await ownerBucket.download(key);
  ensure(!ownerDownload.error && ownerDownload.data, "owner_storage_download_failed");
  ensure(await ownerDownload.data.text() === content, "owner_storage_content_mismatch");

  let ownerOverwrite;
  try {
    ownerOverwrite = await ownerBucket.upload(key, new Blob(["owner overwrite"], { type: "text/plain" }));
  } catch {
    ownerOverwrite = { error: true };
  }
  ensure(errorPresent(ownerOverwrite), "owner_storage_overwrite_allowed");
  const unchangedAfterOwnerOverwrite = await ownerBucket.download(key);
  ensure(
    !unchangedAfterOwnerOverwrite.error && Boolean(unchangedAfterOwnerOverwrite.data),
    "owner_storage_overwrite_removed_file",
  );
  ensure(
    await unchangedAfterOwnerOverwrite.data.text() === content,
    "owner_storage_overwrite_mutated_file",
  );

  const crossFileRead = await accountFilesTable(staffDb)
    .select("id,filename")
    .eq("id", id)
    .maybeSingle();
  ensure(!crossFileRead.error && crossFileRead.data === null, "cross_user_file_metadata_read_allowed");

  const crossFileDelete = await accountFilesTable(staffDb)
    .delete()
    .eq("id", id)
    .select("id");
  ensure(!crossFileDelete.error && asArray(crossFileDelete.data).length === 0, "cross_user_file_metadata_delete_succeeded");

  const foreignMetadataInsert = await accountFilesTable(customerDb).insert([
    {
      id: randomUUID(),
      user_id: staff.userId,
      object_key: `${staff.userId}/${randomUUID()}.txt`,
      storage_url: uploaded.data.url,
      filename: "foreign.txt",
      byte_size: 5,
    },
  ]);
  ensure(errorPresent(foreignMetadataInsert), "foreign_file_metadata_insert_allowed");

  const anonymousMetadata = await accountFilesTable(createClient({ baseUrl: context.baseUrl }))
    .select("id")
    .eq("id", id);
  ensure(errorPresent(anonymousMetadata), "anonymous_file_metadata_read_allowed");

  const crossStorageDownload = await staffBucket.download(key);
  ensure(errorPresent(crossStorageDownload), "cross_user_storage_download_allowed");

  const crossStorageDelete = await staffBucket.remove(key);
  if (!errorPresent(crossStorageDelete)) {
    const stillPresent = await ownerBucket.download(key);
    ensure(!stillPresent.error && Boolean(stillPresent.data), "cross_user_storage_delete_allowed");
    ensure(await stillPresent.data.text() === content, "cross_user_storage_delete_mutated_owner_file");
  }

  const overwrite = await staffBucket.upload(key, new Blob(["foreign overwrite"], { type: "text/plain" }));
  if (!errorPresent(overwrite)) {
    const unchanged = await ownerBucket.download(key);
    ensure(!unchanged.error && Boolean(unchanged.data), "cross_user_storage_overwrite_allowed");
    ensure(await unchanged.data.text() === content, "cross_user_storage_overwrite_mutated_owner_file");
  }

  const foreignKey = `${customer.userId}/${randomUUID()}.txt`;
  await staffBucket.upload(
    foreignKey,
    new Blob(["foreign path"], { type: "text/plain" }),
  );
  // The storage proxy may report a completed transfer while row-level policy silently
  // rejects visibility; confirm persistence independently through the admin-only view.
  ensure(
    !(await adminStorageContains(context, foreignKey, "storage_admin_list_failed")),
    "foreign_prefix_storage_upload_allowed",
  );

  const anonymousDownload = await fetch(uploaded.data.url);
  ensure(!anonymousDownload.ok, "anonymous_private_storage_download_allowed");

  const anonymousStorageDownload = await createClient({ baseUrl: context.baseUrl })
    .storage.from(fileBucketName)
    .download(key);
  ensure(errorPresent(anonymousStorageDownload), "anonymous_storage_sdk_download_allowed");

  const invalidMimeKey = `${customer.userId}/${randomUUID()}.txt`;
  const invalidMime = await ownerBucket.upload(
    invalidMimeKey,
    new Blob(["invalid type"], { type: "application/octet-stream" }),
  );
  ensure(
    errorPresent(invalidMime) || !(await adminStorageContains(context, invalidMimeKey, "storage_admin_list_failed")),
    "storage_mime_limit_not_enforced",
  );

  const oversizedKey = `${customer.userId}/${randomUUID()}.txt`;
  const oversized = await ownerBucket.upload(
    oversizedKey,
    new Blob([new Uint8Array(65537)], { type: "text/plain" }),
  );
  ensure(
    errorPresent(oversized) || !(await adminStorageContains(context, oversizedKey, "storage_admin_list_failed")),
    "storage_size_limit_not_enforced",
  );

  const apiForm = new FormData();
  apiForm.append("file", new Blob(["api owner file\n"], { type: "text/plain" }), "harness-api.txt");
  const apiUpload = await appRequest(context.appOrigin, "/api/account/files", auth.customer.appToken, {
    method: "POST",
    headers: { origin: context.appOrigin },
    body: apiForm,
  });
  ensure(apiUpload.status === 201, "account_file_api_upload_failed");
  const apiUploadBody = await safeJson(apiUpload, "account_file_api_invalid_json");
  const apiFile = apiUploadBody.data;
  ensure(
    typeof apiFile?.id === "string" &&
      apiFile.filename === "harness-api.txt" &&
      apiFile.byte_size === Buffer.byteLength("api owner file\n"),
    "account_file_api_upload_shape_invalid",
  );

  const ownerApiListResponse = await appRequest(context.appOrigin, "/api/account/files", auth.customer.appToken);
  ensure(ownerApiListResponse.status === 200, "account_file_api_list_failed");
  const ownerApiList = await safeJson(ownerApiListResponse, "account_file_api_invalid_json");
  ensure(asArray(ownerApiList.data).some((file) => file.id === apiFile.id), "account_file_api_list_missing_owner_file");

  const crossApiListResponse = await appRequest(context.appOrigin, "/api/account/files", auth.staff.appToken);
  ensure(crossApiListResponse.status === 200, "cross_user_account_file_api_list_failed");
  const crossApiList = await safeJson(crossApiListResponse, "account_file_api_invalid_json");
  ensure(!asArray(crossApiList.data).some((file) => file.id === apiFile.id), "cross_user_account_file_api_list_exposed");

  const ownerApiDownload = await appRequest(
    context.appOrigin,
    `/api/account/files/${encodeURIComponent(apiFile.id)}`,
    auth.customer.appToken,
  );
  ensure(ownerApiDownload.status === 200, "account_file_api_download_failed");
  ensure(await ownerApiDownload.text() === "api owner file\n", "account_file_api_download_mismatch");

  const crossApiDownload = await appRequest(
    context.appOrigin,
    `/api/account/files/${encodeURIComponent(apiFile.id)}`,
    auth.staff.appToken,
  );
  ensure(crossApiDownload.status === 404, "cross_user_account_file_api_download_allowed");

  const ownerApiDelete = await appRequest(
    context.appOrigin,
    `/api/account/files/${encodeURIComponent(apiFile.id)}`,
    auth.customer.appToken,
    { method: "DELETE", headers: { origin: context.appOrigin } },
  );
  ensure(ownerApiDelete.status === 200, "account_file_api_delete_failed");
}

async function runHarness(context, runId, keepFixtures) {
  let fixtures = [];
  let keep = false;

  try {
    const created = await createFixtures(context.clerk, runId, (fixture) => fixtures.push(fixture));
    await verifyProfileAndApi(context, fixtures, created.auth);
    console.log("[PASS] customer profile RLS and profile API");
    await verifyStaffAccess(context, fixtures, created.auth);
    console.log("[PASS] staff capability authorization and metadata isolation");
    await verifyPrivateFiles(context, fixtures, created.auth);
    console.log("[PASS] private account file RLS and API");
    await verifyRealTokenExpiry(context, created.auth);

    if (keepFixtures) {
      await saveFixtures(fixtures);
      keep = true;
    }
    console.log("Phase 2 integration harness passed (2 synthetic development users).");
  } finally {
    if (!keep && fixtures.length > 0) {
      await cleanFixtures(context, fixtures, runId);
      console.log("Fixture cleanup completed.");
    }
  }

  if (keep) {
    console.log("Retained 2 synthetic fixtures in the ignored .bootstrap file; no tokens, passwords, or keys were saved.");
  }
}

function tokenExpiration(jwt) {
  try {
    const payload = jwt.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isSafeInteger(decoded.exp) ? decoded.exp : null;
  } catch {
    return null;
  }
}

async function verifyRealTokenExpiry(context, auth) {
  const jwt = auth.expiringInsforgeToken;
  const expiresAt = typeof jwt === "string" ? tokenExpiration(jwt) : null;
  if (!expiresAt) {
    console.log("[SKIP] genuine InsForge token expiry (no readable expiry claim)");
    return;
  }

  const remainingMs = expiresAt * 1000 - Date.now();
  if (remainingMs > 5 * 60 * 1000) {
    console.log("[SKIP] genuine InsForge token expiry (template lifetime exceeds five minutes)");
    return;
  }

  const waitMs = Math.max(0, remainingMs + 6000);
  let waited = 0;
  while (waited < waitMs) {
    const slice = Math.min(10_000, waitMs - waited);
    await new Promise((resolve) => setTimeout(resolve, slice));
    waited += slice;
  }

  const expiredClient = createRuntimeClient(context.baseUrl, jwt);
  const result = await expiredClient.database.schema("public").rpc("has_capability", {
    capability_name: "content.edit",
  });
  ensure(result.status === 401 && result.data === null && errorPresent(result), "expired_real_token_accepted");
  console.log("[PASS] expired genuine InsForge template token rejected (401)");
}

async function main() {
  let args;
  try {
    args = parseArguments();
  } catch (error) {
    if (error instanceof HarnessFailure) {
      console.error(`Harness stopped safely: ${error.label}.`);
      process.exitCode = 2;
      return;
    }
    console.error("Harness stopped safely: invalid_command_line.");
    process.exitCode = 2;
    return;
  }

  let context;
  try {
    context = await preflight();
  } catch (error) {
    const label = error instanceof HarnessFailure ? error.label : "preflight_failed";
    console.error(`Harness stopped safely: ${label}.`);
    process.exitCode = 2;
    return;
  }

  if (args.cleanupOnly) {
    try {
      const count = await cleanupStoredFixtures(context);
      console.log(`Cleanup completed for ${count} verified synthetic fixture users.`);
    } catch (error) {
      const label = error instanceof HarnessFailure ? error.label : "fixture_cleanup_failed";
      console.error(`Cleanup stopped safely: ${label}.`);
      process.exitCode = 1;
    }
    return;
  }

  try {
    await runHarness(context, randomUUID(), args.keepFixtures);
  } catch (error) {
    const label = error instanceof HarnessFailure ? error.label : "unexpected_test_failure";
    console.error(`Phase 2 integration harness failed safely: ${label}.`);
    process.exitCode = 1;
  }
}

export { preflight, createFixtures, verifyFixtureOwnership, cleanFixtures, saveFixtures, createRuntimeClient, appRequest, ensure, safeJson };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
