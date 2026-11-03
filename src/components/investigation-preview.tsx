"use client";
import Universe3D, { type UniverseSelection } from './universe3d';
import { fixtureReport } from '@/lib/investigation-fixture';

export default function InvestigationPreview({paused,onSelect}:{paused:boolean;onSelect:(selection:UniverseSelection)=>void}) {
  return <Universe3D wallets={fixtureReport.investigation.wallets} relationships={fixtureReport.investigation.relationships} selected={null} onSelect={onSelect} paused={paused}/>;
}
