import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get("limit") ?? 10), 50)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("scans")
    .select("id, file_name, file_type, score, status, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Failed to fetch scans:", error)
    return NextResponse.json({ scans: [] })
  }

  return NextResponse.json({ scans: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { fileName, fileType, score, durationMs } = body
  if (typeof fileName !== "string" || typeof score !== "number") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const status = score <= 30 ? "authentic" : score <= 60 ? "inconclusive" : "deepfake"

  // Get user if logged in, but don't require it
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("scans")
    .insert({
      user_id: user?.id ?? null,
      file_name: fileName,
      file_type: fileType ?? "video",
      score,
      status,
      duration_ms: durationMs ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to save scan:", error)
    return NextResponse.json({ error: "Failed to save scan" }, { status: 500 })
  }

  return NextResponse.json({ scan: data })
}
