import { getFullOrderByIdOrThrow } from '../models/order.model.js';
import { getUserByIdOrThrow } from '../models/user.model.js';
import { sendReceiptEmail } from '../utils/mailer.js';
import {
    generatePaymentReference,
    generatePayNowQRCodeUsingSGQR
} from '../services/payment.service.js';


/**
 * @swagger
 * /api/payment/confirm/{orderId}:
 *   post:
 *     summary: Confirm payment and send receipt through email
 *     description: |
 *       Confirms the payment for an order and sends a receipt email to the customer.
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Receipt sent
 *         content:
 *           application/json:
 *             example:
 *               message: Receipt email sent successfully
 *       202:
 *         description: Payment not yet verified
 *         content:
 *           application/json:
 *             example:
 *               message: "Payment not yet verified. Try again later."
 *               verified: false
 *       404:
 *         description: Order or email not found
 *         content:
 *           application/json:
 *             example:
 *               error: "User email not found"
 *               code: "NOT_FOUND_USER"
 */
/**
 * POST /api/payment/confirm/:orderId
 * Confirms payment and emails the receipt to the user.
 */
export const confirmPaymentAndSendReceipt = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    // Fetch order with items
    const order = await getFullOrderByIdOrThrow(orderId);
    console.log('[DEBUG] order.items:', JSON.stringify(order.items, null, 2));


    // Attach payment reference dynamically
    order.payment_reference = await generatePaymentReference(order.order_id);

    // Verify payment
    const total = (order.total_amount_cents / 100).toFixed(2);
    //const isVerified = await verify_payment(total, order.payment_reference);
    //TODO: add the method here instead of perma true
    const isVerified = true;
    if (!isVerified) {
      return res.status(202).json({
        message: 'Payment not yet verified. Try again later.',
        verified: false
      });
    }

    // Fetch user email
    const {email} = await getUserByIdOrThrow(order.customer_id, "email");
    if (!email) return res.status(404).json({ message: 'User email not found' });
    // Send the email
    await sendReceiptEmail(email, order);

    res.status(200).json({ message: 'Receipt email sent successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * @swagger
 * /api/orders/{orderId}/payment:
 *   get:
 *     summary: Get payment instructions
 *     description: |
 *       Returns a fresh PayNow QR code, reference and paynow number for the specified order. 
 * 
 *       QR code is a base64 encoded PNG image, expiring 10 minutes after generation. The one that is pink with the paynow word inside works with non DBS banks as well
 * 
 *       Reference is in the format `SMUNCH{orderId}`.
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Payment info returned
 *         content:
 *           application/json:
 *             example:
 *               qrCode: data:image/png;base64,iVBORw0KGgoAAAAN...
 *               payment_reference: SMUNCH14
 *               paynow_number: 96773374
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             example:
 *               error: "Order with ID 42 does not exist"
 *               code: "NOT_FOUND_ORDER"
 */
/**
 * GET /api/orders/:orderId/payment
 *
 * Regenerates PayNow QR code, reference number, and PayNow phone.
 * Use when user revisits the payment screen.
 */
export async function getPaymentInstructions(req, res, next) {
  try {
    const { orderId } = req.params;
    const order = await getFullOrderByIdOrThrow(orderId);
    if (!order) {
      return res.status(404).json({ message: '[DEBUG] In method checker: Order not found' });
    }

    const amount = (order.total_amount_cents / 100).toFixed(2);
    const { qrCodeDataURL, paymentReference, paynowNumber } = await generatePayNowQRCodeUsingSGQR({
      amount: amount,
      orderId: order.order_id,
      customerId: order.customer_id,
    });

    res.status(200).json({
      qrCode: qrCodeDataURL,
      payment_reference: paymentReference,
      paynow_number: paynowNumber
    });
  } catch (err) {
    next(err);
  }
}
