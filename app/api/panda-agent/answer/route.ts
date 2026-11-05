import { auth } from '@clerk/nextjs/server';

// All new answers require the durable chat turn boundary.
export async function POST() {
  const session=await auth();
  return Response.json({error:session.isAuthenticated?'unavailable':'unauthenticated'}, {status:session.isAuthenticated?503:401,headers:{'cache-control':'private, no-store'}});
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
