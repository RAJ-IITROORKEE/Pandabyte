import { clerkMiddleware } from "@clerk/nextjs/server";
import { hostedStorefrontTestEnabled } from "./lib/checkout/test-deployment";

export default clerkMiddleware(() => {}, (request) => {
  const razorpayTest = (process.env.NODE_ENV === "development" && process.env.PANDABYTE_RAZORPAY_TEST_ENABLED === "true") || hostedStorefrontTestEnabled(request, process.env);
  const razorpayFrames = razorpayTest ? ["https://api.razorpay.com", "https://checkout.razorpay.com"] : [];
  return {
    contentSecurityPolicy: {
      strict: true,
      directives: {
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "script-src-attr": ["'none'"],
        // GLTFLoader decodes validated embedded textures through local Blob URLs.
        "connect-src": ["blob:", ...razorpayFrames],
        "img-src": ["blob:"],
        "frame-src": ["'self'", "https://www.youtube-nocookie.com", ...razorpayFrames],
        ...(razorpayTest ? { "script-src": ["https://checkout.razorpay.com"] } : {}),
      },
    },
  };
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
