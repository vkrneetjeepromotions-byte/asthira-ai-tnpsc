export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const appId = (process.env.CASHFREE_APP_ID || "").trim();
    const secretKey = (process.env.CASHFREE_SECRET_KEY || "").trim();

    if (!appId || !secretKey) {
      return res.status(500).json({
        error: "Cashfree credentials are not configured in Vercel.",
      });
    }

    const {
      targetExam,
      fullName,
      email,
      phone,
      studentId,
    } = req.body || {};

    if (!fullName || !email || !phone || !studentId) {
      return res.status(400).json({
        error: "Student details are required.",
      });
    }

    const premiumExams = [
      "CBSE",
      "NEET",
      "JEE",
      "Sainik School",
    ];

    const isPremium = premiumExams.includes(targetExam);

    const amount = isPremium ? 500 : 20;

    const orderId =
      "ASTHIRA_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    const baseUrl =
      req.headers.origin ||
      "https://asthira-ai-tnpsc.vercel.app";

    const payload = {
      order_id: orderId,
      order_amount: amount,
      order_currency: "INR",

      customer_details: {
        customer_id: studentId,
        customer_name: fullName,
        customer_email: email,
        customer_phone: phone,
      },

      order_meta: {
        return_url:
          `${baseUrl}/?cashfree_order_id=${encodeURIComponent(orderId)}`,
      },

      order_note: "ASTHIRA AI Student Subscription",
    };

    const response = await fetch(
      "https://sandbox.cashfree.com/pg/orders",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2025-01-01",
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Cashfree order error:", result);

      return res.status(502).json({
        error:
          result.message ||
          "Cashfree order creation failed.",
        details: result,
      });
    }

    return res.status(200).json({
      success: true,
      orderId: result.order_id,
      amount: amount.toFixed(2),
      paymentSessionId: result.payment_session_id,
      planDays: isPremium ? 30 : 6,
    });
  } catch (error) {
    console.error("Cashfree create order error:", error);

    return res.status(500).json({
      error:
        error.message ||
        "Internal server error while creating Cashfree transaction.",
    });
  }
}
