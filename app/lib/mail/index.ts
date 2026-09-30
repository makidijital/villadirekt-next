/* ===============================================================
   🔥 MAIL MODULE INDEX
   ===============================================================
   Tek import noktası:
     import { sendMail, renderTestEmail, ... } from "@/app/lib/mail"
   =============================================================== */

export { sendMail } from "./send";
export { getMailConfig, formatFrom, resendSend } from "./client";

export { renderTestEmail } from "./templates/TestEmail";
export { renderReservationRequestEmail } from "./templates/ReservationRequestEmail";
export { renderReservationApprovedEmail } from "./templates/ReservationApprovedEmail";
export { renderReservationCancelledEmail } from "./templates/ReservationCancelledEmail";
export { renderPaymentLinkEmail } from "./templates/PaymentLinkEmail";
export { renderBankTransferPaymentEmail } from "./templates/BankTransferPaymentEmail";
export { renderPaymentConfirmedEmail } from "./templates/PaymentConfirmedEmail";
