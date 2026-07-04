'use server';

import { sql, eq } from 'drizzle-orm';
import { db } from '@/db';
import { picoLinks, payments, widgetViews, users } from '@/db/schema';
import { auth } from '@/auth';
import { isAdmin } from '@/lib/roles';

/**
 * Widget-flavoured data helpers.
 *
 * "Widget" and "Pico link" are the same row in `pico_links` — we just
 * surface different facets depending on the audience:
 *   - Creator dashboard frames them as "links" (shareable URLs)
 *   - Publisher dashboard frames them as "widgets" (deployed on a site)
 *
 * The DB stays single-tenant simple; the UI does the framing.
 */

const DORMANT_DAYS = 7;
const dormantThreshold = () =>
  new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000).toISOString();

export interface WidgetStat {
  linkId: string;
  title: string;
  price: string;
  type: string | null;
  views: number;
  conversions: number;
  conversionRate: number;       // 0..1
  grossRevenue: string;
  lastViewAt: string | null;
  topReferrer: string | null;
  status: 'active' | 'dormant' | 'idle';   // active = view <7d, dormant = view ever but >7d, idle = never viewed
}

export async function getWidgetStatsForOwner(): Promise<{ success: boolean; widgets: WidgetStat[] }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { success: false, widgets: [] };

  try {
    const links = await db.query.picoLinks.findMany({
      where: eq(picoLinks.creatorId, userId),
    });
    if (links.length === 0) return { success: true, widgets: [] };

    const widgets = await Promise.all(links.map(async (link) => buildWidgetStat(link)));
    return { success: true, widgets };
  } catch (error) {
    console.error('[widgets] getWidgetStatsForOwner failed:', error);
    return { success: false, widgets: [] };
  }
}

export async function getAllWidgetStatsForAdmin(): Promise<{ success: boolean; widgets: (WidgetStat & { creatorHandle: string | null })[] }> {
  const session = await auth();
  const allowed = await isAdmin(session?.user?.id, session?.user?.email ?? undefined);
  if (!allowed) return { success: false, widgets: [] };

  try {
    const rows = await db
      .select({
        id: picoLinks.id,
        title: picoLinks.title,
        price: picoLinks.price,
        type: picoLinks.type,
        creatorId: picoLinks.creatorId,
        creatorHandle: users.handle,
      })
      .from(picoLinks)
      .leftJoin(users, sql`${picoLinks.creatorId} = ${users.id}::text`);

    const widgets = await Promise.all(rows.map(async (row) => {
      const stat = await buildWidgetStat({
        id: row.id, title: row.title, price: row.price, type: row.type, creatorId: row.creatorId,
      });
      return { ...stat, creatorHandle: row.creatorHandle };
    }));

    return { success: true, widgets };
  } catch (error) {
    console.error('[widgets] getAllWidgetStatsForAdmin failed:', error);
    return { success: false, widgets: [] };
  }
}

async function buildWidgetStat(link: { id: string; title: string; price: string; type: string | null; creatorId: string }): Promise<WidgetStat> {
  const [viewAgg, paymentAgg, latestView, topRef] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)::int` }).from(widgetViews).where(eq(widgetViews.linkId, link.id)),
    db
      .select({
        count: sql<number>`COUNT(*)::int`,
        total: sql<string>`COALESCE(SUM(${payments.amount}), '0.00')`,
      })
      .from(payments)
      .where(eq(payments.linkId, link.id)),
    db
      .select({ createdAt: widgetViews.createdAt })
      .from(widgetViews)
      .where(eq(widgetViews.linkId, link.id))
      .orderBy(sql`${widgetViews.createdAt} DESC`)
      .limit(1),
    db
      .select({
        referrer: widgetViews.referrer,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(widgetViews)
      .where(sql`${widgetViews.linkId} = ${link.id} AND ${widgetViews.referrer} IS NOT NULL`)
      .groupBy(widgetViews.referrer)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1),
  ]);

  const views = Number(viewAgg[0]?.count || 0);
  const conversions = Number(paymentAgg[0]?.count || 0);
  const lastView = latestView[0]?.createdAt ?? null;

  let status: WidgetStat['status'] = 'idle';
  if (lastView) {
    status = lastView.toISOString() > dormantThreshold() ? 'active' : 'dormant';
  }

  return {
    linkId: link.id,
    title: link.title,
    price: link.price,
    type: link.type,
    views,
    conversions,
    conversionRate: views > 0 ? conversions / views : 0,
    grossRevenue: paymentAgg[0]?.total || '0.00',
    lastViewAt: lastView ? lastView.toISOString() : null,
    topReferrer: topRef[0]?.referrer ?? null,
    status,
  };
}
