import PaytmChecksum from "paytmchecksum";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const mid = (process.env.PAYTM_MID || "").trim();
    const merchantKey = (process.env.PAYTM_MERCHANT_KEY || "").trim();
    const website = (process.env.PAYTM_WEBSITE || "WEBSTAGING").trim();

    if (!mid || !merchantKey) {
      return res.status(500).json({
        error: "Paytm credentials are not configured in Vercel.",
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

    const amount = isPremium ? "500.00" : "20.00";
    const planDays = isPremium ? 30 : 6;

    const orderId =
      "ASTHIRA_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    const body = {
      requestType: "Payment",
      mid: mid,
      websiteName: website,
      orderId: orderId,
callbackUrl:
  `https://securestage.paytmpayments.com/theia/paytmCallback?ORDER_ID=${orderId}`,
     
      txnAmount: {
        value: amount,
        currency: "INR",
      },

      userInfo: {
        custId: studentId,
        mobile: phone,
        email: email,
        firstName: fullName,
      },
    };

    const bodyString = JSON.stringify(body);

    const signature = await PaytmChecksum.generateSignature(
      bodyString,
      merchantKey
    );

    const paytmRequest = {
  body: body,
  head: {
    channelId: "WEB",
    signature: signature,
  },
};

    const paytmUrl =
      "https://securestage.paytmpayments.com/theia/api/v1/initiateTransaction" +
      `?mid=${encodeURIComponent(mid)}` +
      `&orderId=${encodeURIComponent(orderId)}`;

    const response = await fetch(paytmUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paytmRequest),
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Paytm transaction initiation failed.",
        details: result,
      });
    }

    if (
      !result.body ||
      !result.body.resultInfo ||
      result.body.resultInfo.resultStatus !== "S"
    ) {
      return res.status(400).json({
        error:
          `Paytm ${
            result.body?.resultInfo?.resultCode || "UNKNOWN"
          }: ${
            result.body?.resultInfo?.resultMsg ||
            "Unable to create Paytm transaction."
          }`,
        details: result,
      });
    }

    return res.status(200).json({
      success: true,
      orderId: orderId,
      amount: amount,
      planDays: planDays,
      txnToken: result.body.txnToken,
      mid: mid,
      website: website,
    });
  } catch (error) {
    console.error("Paytm create order error:", error);

    return res.status(500).json({
      error:
        error.message ||
        "Internal server error while creating Paytm transaction.",
    });
  }
}
