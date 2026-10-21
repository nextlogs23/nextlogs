import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { smsProvider } from "@/lib/server/providers";
export async function GET(req:NextRequest){try{await requireUser(req);const country=req.nextUrl.searchParams.get('country')||'';if(!/^[A-Z]{2}$/.test(country))return Response.json({error:'Use an ISO country code'},{status:400});return Response.json({services:await smsProvider().listServices(country)})}catch(e){return routeError(e)}}
