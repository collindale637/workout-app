"use client";

import { useCallback } from "react";
import { useData, useProfile } from "@/lib/db/provider";
import { markDeleted, markDirty } from "@/lib/db/sync";
import { newId, nowIso } from "@/lib/db/dexie";
import { defaultDetails, templateEquipment } from "@/lib/defaults";
import type { EquipmentDetails, Gym, GymTemplate } from "@/lib/db/types";

export function useGymActions() {
  const { db, requestSync } = useData();
  const { profile, save: saveProfile } = useProfile();

  const createGym = useCallback(
    async (name: string, template: GymTemplate, makeActive = true) => {
      const catalog = await db.equipment.toArray();
      const existing = await db.gyms.count();
      const gym: Gym = { id: newId(), name: name.trim() || "My gym", template, is_default: existing === 0, created_at: nowIso() };
      const items = templateEquipment(template, catalog);
      await db.transaction("rw", [db.gyms, db.gym_equipment, db.outbox], async () => {
        await db.gyms.put(gym);
        await db.gym_equipment.bulkPut(items.map((id) => ({ gym_id: gym.id, equipment_id: id, details: defaultDetails(id, template) })));
        await markDirty(db, "gyms", gym.id);
        await markDirty(db, "gym_equipment", gym.id);
      });
      if (makeActive || !profile?.active_gym_id) await saveProfile({ active_gym_id: gym.id });
      requestSync();
      return gym;
    },
    [db, profile?.active_gym_id, requestSync, saveProfile],
  );

  const updateGym = useCallback(
    async (gym: Gym) => {
      await db.gyms.put(gym);
      await markDirty(db, "gyms", gym.id);
      requestSync();
    },
    [db, requestSync],
  );

  /** Replaces a gym's whole equipment list in one go (the editor's Save button). */
  const saveEquipment = useCallback(
    async (gymId: string, rows: { equipment_id: string; details: EquipmentDetails }[]) => {
      await db.transaction("rw", [db.gym_equipment, db.outbox], async () => {
        await db.gym_equipment.where("gym_id").equals(gymId).delete();
        await db.gym_equipment.bulkPut(rows.map((r) => ({ gym_id: gymId, ...r })));
        await markDirty(db, "gym_equipment", gymId);
      });
      requestSync(1000);
    },
    [db, requestSync],
  );

  const makeDefault = useCallback(
    async (gymId: string) => {
      const gyms = await db.gyms.toArray();
      for (const g of gyms) {
        if (g.is_default !== (g.id === gymId)) {
          await db.gyms.update(g.id, { is_default: g.id === gymId });
          await markDirty(db, "gyms", g.id);
        }
      }
      requestSync();
    },
    [db, requestSync],
  );

  const deleteGym = useCallback(
    async (gymId: string) => {
      await db.transaction("rw", [db.gyms, db.gym_equipment, db.outbox, db.tombstones], async () => {
        await db.gym_equipment.where("gym_id").equals(gymId).delete();
        await db.outbox.delete(["gym_equipment", gymId]);
        await db.gyms.delete(gymId);
        await markDeleted(db, "gyms", gymId);
      });
      if (profile?.active_gym_id === gymId) {
        const next = await db.gyms.toCollection().first();
        await saveProfile({ active_gym_id: next?.id ?? null });
      }
      requestSync();
    },
    [db, profile?.active_gym_id, requestSync, saveProfile],
  );

  return { createGym, updateGym, saveEquipment, makeDefault, deleteGym };
}
