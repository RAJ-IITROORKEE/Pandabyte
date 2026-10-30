import { razorpayTestRoute } from "@/lib/checkout/razorpay-test";
import { storefrontTestCapabilities } from "@/lib/checkout/storefront-test";
export const GET = async (request: Request) => await storefrontTestCapabilities(request) ?? razorpayTestRoute(request, "capabilities");
