const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const { PassThrough } = require("stream");

function formatMoney(amount) {
  const currency = process.env.CURRENCY || "JMD";
  return `${currency} $${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Builds a one-page PDF receipt and returns it as a Buffer.
function buildReceiptPdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = new PassThrough();
    const chunks = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.pipe(stream);

    const siteName = process.env.SITE_NAME || "Steven Scale Solutions";

    doc.fontSize(20).text(siteName, { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#555").text("Official Receipt");
    doc.moveDown(1);

    doc.fillColor("#000").fontSize(11);
    doc.text(`Receipt #: ${order.id}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleString("en-JM")}`);
    doc.text(`Customer: ${order.customer.name}`);
    doc.text(`Email: ${order.customer.email}`);
    if (order.customer.phone) doc.text(`Phone: ${order.customer.phone}`);
    if (order.customer.address) doc.text(`Delivery address: ${order.customer.address}`);
    doc.moveDown(1);

    doc.fontSize(12).text("Items", { underline: true });
    doc.moveDown(0.3);

    order.items.forEach((item) => {
      doc
        .fontSize(11)
        .text(
          `${item.name}  x${item.quantity}`,
          { continued: true }
        )
        .text(formatMoney(item.price * item.quantity), { align: "right" });
    });

    doc.moveDown(0.5);
    doc.moveTo(doc.x, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.5);

    doc
      .fontSize(13)
      .text("Total", { continued: true })
      .text(formatMoney(order.total), { align: "right" });

    doc.moveDown(1.5);
    doc.fontSize(9).fillColor("#777").text(
      `Payment status: ${order.status.toUpperCase()}${
        order.providerReference ? ` (ref: ${order.providerReference})` : ""
      }`
    );
    doc.text("Thank you for your business!");

    doc.end();
  });
}

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

// Emails the receipt PDF to the customer, and a copy to the business owner.
// If SMTP isn't configured yet, this quietly no-ops (the order still saves,
// and the receipt is viewable/downloadable from the site) so local testing
// doesn't require an email account.
async function sendReceiptEmails(order, pdfBuffer) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(
      `[receipts] SMTP not configured — skipping email for order ${order.id}. ` +
        "Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env to enable receipt emails."
    );
    return;
  }

  const from = process.env.RECEIPT_FROM_EMAIL || process.env.SMTP_USER;
  const attachments = [
    {
      filename: `receipt-${order.id}.pdf`,
      content: pdfBuffer,
    },
  ];

  await transporter.sendMail({
    from,
    to: order.customer.email,
    subject: `Your receipt from ${process.env.SITE_NAME || "Steven Scale Solutions"} (#${order.id})`,
    text: `Thanks for your order! Total: ${formatMoney(order.total)}. Your receipt is attached.`,
    attachments,
  });

  const businessEmail = process.env.BUSINESS_RECEIPT_EMAIL;
  if (businessEmail) {
    await transporter.sendMail({
      from,
      to: businessEmail,
      subject: `New order #${order.id} — ${formatMoney(order.total)}`,
      text: `New paid order from ${order.customer.name} <${order.customer.email}>. Total: ${formatMoney(
        order.total
      )}. Receipt attached.`,
      attachments,
    });
  }
}

module.exports = { buildReceiptPdf, sendReceiptEmails, formatMoney };
