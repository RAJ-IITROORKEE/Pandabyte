import { razorpayTestRoute } from "@/lib/checkout/razorpay-test";
export const POST = (request: Request) => razorpayTestRoute(request, "recover");
