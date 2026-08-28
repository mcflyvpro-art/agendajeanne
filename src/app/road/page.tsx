'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ChildShell from '@/components/ChildShell';
import LevelRoad from '@/components/LevelRoad';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { Loader } from '@/components/ui';
import type { Reward } from '@/lib/types';

export default function RoadPage() { return <ChildShell><Road /></ChildShell>; }

function Road() {
  const { profile, settings } = useApp();
  const [items, setItems] = useState<Reward[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [r, o] = await Promise.all([
        supabase.from('rewards').select('*').eq('kind', 'item').not('unlock_level', 'is', null).order('unlock_level'),
        supabase.from('child_items').select('item_value').eq('child_id', profile.id),
      ]);
      setItems((r.data ?? []) as Reward[]);
      setOwned(new Set((o.data ?? []).map((x: any) => x.item_value)));
      setLoading(false);
    })();
  }, [profile?.id]);

  if (loading || !profile || !settings) return <Loader />;

  return (
    <main className="mx-auto max-w-lg px-4 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="flex items-center gap-3">
        <Link href="/me" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-soft text-lg font-black text-muted no-select active:scale-90">←</Link>
        <h1 className="text-2xl font-black text-ink">Ma route</h1>
      </div>
      <div className="mt-4">
        <LevelRoad settings={settings} xp={profile.xp} avatarEmoji={profile.avatar_emoji} items={items} owned={owned} />
      </div>
    </main>
  );
}
