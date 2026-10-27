import { razorpayTestRoute } from "@/lib/checkout/razorpay-test";
export const GET = (request: Request) => razorpayTestRoute(request, "capabilities");
