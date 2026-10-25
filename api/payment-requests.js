const PREMIUM_EXAMS = new Set(["CBSE", "NEET", "JEE", "Sainik School"]);
const TABLE = "ast_payment_requests";

function send(res, status, body) {
  return res.status(status).json(body);
}

function getConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !anonKey || !serviceKey) throw new Error("Supabase server configuration is incomplete.");
  return { url, anonKey, serviceKey };
}

async function supabaseFetch(url, key, options = {}) {
  const { bearer, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer || key}`,
      ...(fetchOptions.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { message: text }; }
  return { response, data };
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (_) { return {}; }
}

async function requireAdmin(req, config) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: { status: 401, message: "Sign in as an administrator." } };
  const accessToken = match[1];
  const auth = await supabaseFetch(`${config.url}/auth/v1/user`, config.anonKey, {
    method: "GET", bearer: accessToken
  });
  if (!auth.response.ok || !auth.data || !auth.data.id) {
    return { error: { status: 401, message: "Your session is invalid or expired." } };
  }
  const profile = await supabaseFetch(
    `${config.url}/rest/v1/profiles?select=id,role&id=eq.${encodeURIComponent(auth.data.id)}&limit=1`,
    config.serviceKey
  );
  if (!profile.response.ok || !Array.isArray(profile.data) || profile.data[0]?.role !== "admin") {
    return { error: { status: 403, message: "Admin access only." } };
  }
  return { user: auth.data, accessToken, profile: profile.data[0] };
}

async function createRequest(req, res, config) {
  const body = readBody(req);
  const fullName = String(body.fullName || "").trim();
  const studentId = String(body.studentId || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const targetExam = String(body.targetExam || "").trim();
  const batch = String(body.batch || "").trim();
  const utrNumber = String(body.utrNumber || "").trim().toUpperCase();

  if (!fullName || fullName.length > 120 || !studentId || studentId.length > 80 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !/^[6-9]\d{9}$/.test(phone) || !targetExam || targetExam.length > 100 ||
      batch.length > 100 || !/^[A-Z0-9-]{6,32}$/.test(utrNumber)) {
    return send(res, 400, { error: "Check the student details and enter a valid UTR/reference number." });
  }

  const premium = PREMIUM_EXAMS.has(targetExam);
  const amount = premium ? 500 : 20;
  const record = {
    full_name: fullName,
    student_id: studentId,
    email,
    phone,
    target_exam: targetExam,
    batch: batch || null,
    plan_name: premium ? "ASTHIRA Premium" : "ASTHIRA Competitive",
    plan_amount: amount,
    plan_days: premium ? 30 : 6,
    utr_number: utrNumber,
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    admin_note: null,
    payment_screenshot: null
  };

  const result = await supabaseFetch(`${config.url}/rest/v1/${TABLE}?select=id,status,plan_amount,plan_days`, config.serviceKey, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(record)
  });
  if (result.response.status === 409 || result.data?.code === "23505") {
    return send(res, 409, { error: "That UTR/reference number has already been submitted." });
  }
  if (!result.response.ok) {
    console.error("Payment request insert failed:", result.data?.message || result.data?.code || result.response.status);
    return send(res, 500, { error: "Unable to save the payment request. Please try again." });
  }
  const saved = Array.isArray(result.data) ? result.data[0] : null;
  return send(res, 201, { success: true, status: "pending", amount, planDays: premium ? 30 : 6, requestId: saved?.id });
}

async function listRequests(req, res, config) {
  const auth = await requireAdmin(req, config);
  if (auth.error) return send(res, auth.error.status, { error: auth.error.message });
  const result = await supabaseFetch(
    `${config.url}/rest/v1/${TABLE}?select=id,full_name,student_id,email,phone,target_exam,batch,plan_name,plan_amount,plan_days,utr_number,status,created_at&order=created_at.desc&limit=200`,
    config.serviceKey
  );
  if (!result.response.ok) {
    console.error("Payment request list failed:", result.data?.message || result.data?.code || result.response.status);
    return send(res, 500, { error: "Unable to load payment requests." });
  }
  return send(res, 200, { requests: result.data || [] });
}

async function reviewRequest(req, res, config) {
  const auth = await requireAdmin(req, config);
  if (auth.error) return send(res, auth.error.status, { error: auth.error.message });
  const body = readBody(req);
  const id = String(body.requestId || "");
  const action = String(body.action || "");
  const note = String(body.note || "").trim().slice(0, 500);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["approve", "reject"].includes(action)) {
    return send(res, 400, { error: "Choose a valid request and approval action." });
  }

  const requestResult = await supabaseFetch(
    `${config.url}/rest/v1/${TABLE}?select=id,full_name,student_id,email,phone,target_exam,batch,plan_name,plan_amount,plan_days,utr_number,status&id=eq.${encodeURIComponent(id)}&limit=1`,
    config.serviceKey
  );
  if (!requestResult.response.ok || !Array.isArray(requestResult.data) || !requestResult.data[0]) {
    return send(res, 404, { error: "Payment request not found." });
  }
  const request = requestResult.data[0];
  if (request.status !== "pending") return send(res, 409, { error: "This request has already been reviewed." });
  if (String(auth.user.email || "").toLowerCase() === String(request.email || "").toLowerCase()) {
    return send(res, 403, { error: "An administrator cannot approve or reject their own payment request." });
  }

  const status = action === "approve" ? "approved" : "rejected";
  const update = await supabaseFetch(
    `${config.url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&status=eq.pending&select=id`,
    config.serviceKey,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ status, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), admin_note: note || null })
    }
  );
  if (!update.response.ok || !Array.isArray(update.data) || !update.data.length) {
    return send(res, 409, { error: "This request was already reviewed. Refresh the list and try again." });
  }

  if (action === "reject") return send(res, 200, { success: true, status });

  const premium = PREMIUM_EXAMS.has(request.target_exam);
  const invite = await supabaseFetch(`${config.url}/auth/v1/invite`, config.serviceKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: request.email,
      data: {
        full_name: request.full_name,
        student_id: request.student_id,
        phone: request.phone,
        target_exam: request.target_exam,
        batch: request.batch,
        plan_name: premium ? "ASTHIRA Premium" : "ASTHIRA Competitive",
        plan_amount: premium ? 500 : 20,
        plan_days: premium ? 30 : 6
      }
    })
  });
  if (!invite.response.ok) {
    await supabaseFetch(`${config.url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&status=eq.approved`, config.serviceKey, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "pending", reviewed_by: null, reviewed_at: null, admin_note: "" })
    });
    const alreadyExists = invite.response.status === 422;
    return send(res, alreadyExists ? 409 : 502, {
      error: alreadyExists
        ? "An account may already exist for this email. Resolve the existing account before approving this request."
        : "Could not create the student account or send the setup email. The request remains pending."
    });
  }
  return send(res, 200, { success: true, status, accountCreated: true, inviteSent: true });
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return send(res, 405, { error: "Method not allowed." });
  let config;
  try { config = getConfig(); } catch (error) { return send(res, 500, { error: error.message }); }
  try {
    if (req.method === "POST" && req.query?.action === "review") return await reviewRequest(req, res, config);
    if (req.method === "GET") return await listRequests(req, res, config);
    return await createRequest(req, res, config);
  } catch (error) {
    console.error("Payment request API error:", error.message);
    return send(res, 500, { error: "Unexpected payment request error." });
  }
}
