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

    const { orderId, expectedAmount } = req.body || {};

    if (!orderId) {
      return res.status(400).json({
        error: "Order ID is required.",
      });
    }

    const response = await fetch(
      `https://sandbox.cashfree.com/pg/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2025-01-01",
        },
      }
    );

    const order = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error:
          order.message ||
          "Unable to verify Cashfree payment.",
        details: order,
      });
    }

    const amountMatches =
      expectedAmount == null ||
      Number(order.order_amount) === Number(expectedAmount);

    const success =
      order.order_status === "PAID" &&
      amountMatches;

    return res.status(200).json({
      success,
      orderId: order.order_id,
      status: order.order_status,
      amount: order.order_amount,
      amountMatches,
    });
  } catch (error) {
    console.error("Cashfree verification error:", error);

    return res.status(500).json({
      error:
        error.message ||
        "Internal server error while verifying Cashfree payment.",
    });
  }
}
