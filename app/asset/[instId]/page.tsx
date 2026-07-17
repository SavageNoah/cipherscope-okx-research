import type { Metadata } from "next";
import AssetResearchClient from "./AssetResearchClient";

type Props = { params: Promise<{ instId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { instId } = await params;
  const symbol = decodeURIComponent(instId).toUpperCase();
  return {
    title: `${symbol} 独立研究｜CipherScope`,
    description: `${symbol} OKX 行情、交互 K 线、X 观点与三个月情景研究。`,
  };
}

export default async function AssetPage({ params }: Props) {
  const { instId } = await params;
  return <AssetResearchClient instId={decodeURIComponent(instId).toUpperCase()} />;
}
