import { NextResponse } from 'next/server';
import { fetchRscDetail } from '@/lib/api';

interface Params {
  params: {
    id: string;
  };
}

export const revalidate = 60;

export async function GET(_request: Request, { params }: Params) {
  const id = params.id;

  const detail = await fetchRscDetail(id);

  return NextResponse.json(detail ?? { error: 'No detail available' });
}

