import { Router } from "express";
import { router as createCustomer } from "../features/customers/create-customer/endpoint";
import { router as getCustomer } from "../features/customers/get-customer/endpoint";
import { router as listCustomers } from "../features/customers/list-customers/endpoint";
import { router as createPayment } from "../features/payments/create-payment/endpoint";
import { router as getPayment } from "../features/payments/get-payment/endpoint";
import { router as listPayments } from "../features/payments/list-payments/endpoint";

export const apiRouter = Router();

apiRouter.use("/customers", createCustomer);
apiRouter.use("/customers", getCustomer);
apiRouter.use("/customers", listCustomers);
apiRouter.use("/payments", createPayment);
apiRouter.use("/payments", getPayment);
apiRouter.use("/payments", listPayments);
