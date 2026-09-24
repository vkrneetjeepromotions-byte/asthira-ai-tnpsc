import PaytmChecksum from "paytmchecksum";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const mid = process.env.PAYTM_MID;
    const merchantKey = process.env.PAYTM_MERCHANT_KEY;

    if (!mid || !merchantKey) {
      return res.status(500).json({
        error: "Paytm credentials are not configured.",
      });
    }

    const { orderId, expectedAmount } = req.body || {};

    if (!orderId || !expectedAmount) {
      return res.status(400).json({
        error: "Order ID and expected amount are required.",
      });
    }

    const body = {
      mid,
      orderId,
    };

    const signature = await PaytmChecksum.generateSignature(
      JSON.stringify(body),
      merchantKey
    );

    const response = await fetch(
      "https://securegw-stage.paytm.in/v3/order/status",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body,
          head: {
            signature,
          },
        }),
      }
    );

    const result = await response.json();

    const resultInfo = result?.body?.resultInfo;
    const transactionAmount = result?.body?.txnAmount;

    const success =
      resultInfo?.resultCode === "01" &&
      resultInfo?.resultStatus === "TXN_SUCCESS" &&
      transactionAmount === String(expectedAmount);

    return res.status(200).json({
      success,
      orderId,
      status: resultInfo?.resultStatus || "UNKNOWN",
      message: resultInfo?.resultMsg || "Transaction status received.",
      txnId: result?.body?.txnId || null,
      amount: transactionAmount || null,
    });
  } catch (error) {
    console.error("Paytm verification error:", error);

    return res.status(500).json({
      error: "Unable to verify Paytm payment.",
    });
  }
}
