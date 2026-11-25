import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId') || undefined;
  const domains = db.getDomains(tenantId);
  return NextResponse.json({ domains });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domainName, tenantId } = body;

    if (!domainName) {
      return NextResponse.json({ error: 'domainName is required' }, { status: 400 });
    }

    const cleanDomain = domainName.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const newDomain = db.addDomain(tenantId || 'tenant_1', cleanDomain);

    return NextResponse.json({ success: true, domain: newDomain });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
