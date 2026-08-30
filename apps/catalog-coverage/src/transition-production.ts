#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectTransitionReceipt, transitionReceiptSchema, type QueueIdentity } from "../../../packages/catalog-coverage/src/transition-production.js";
import { writeJsonAtomic } from "../../../packages/pipeline-core/src/fs.js";

async function main() {
  const workspace = process.cwd();
  const queue = JSON.parse(await readFile(resolve(workspace, "catalog-data/generated/visual-transition-source-queue.json"), "utf8")) as { vehicles: QueueIdentity[] };
  const receiptRoot = resolve(workspace, "catalog-data/production/vehicles");
  const receipts = new Map<string, unknown>();
  let names: string[] = [];
  try { names = await readdir(receiptRoot); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  for (const name of names.filter((name) => name.endsWith(".json"))) {
    const receipt = transitionReceiptSchema.parse(JSON.parse(await readFile(resolve(receiptRoot, name), "utf8")));
    if (receipts.has(receipt.vehicleKey)) throw new Error(`Duplicate receipt: ${receipt.vehicleKey}`);
    if (!queue.vehicles.some((vehicle) => vehicle.vehicleKey === receipt.vehicleKey)) throw new Error(`Receipt is not in catalog queue: ${receipt.vehicleKey}`);
    receipts.set(receipt.vehicleKey, receipt);
  }
  const vehicles = [];
  for (const vehicle of queue.vehicles) {
    const identity = { vehicleKey: vehicle.vehicleKey, visualFamilyId: vehicle.visualFamilyId, plannedFlowPackId: vehicle.plannedFlowPackId };
    const receipt = receipts.get(vehicle.vehicleKey);
    vehicles.push(receipt ? await inspectTransitionReceipt(workspace, identity, receipt) : {
      ...identity, status: "QUEUED", assetStagesPresent: 0, transitionReady: false, customerReady: false,
      blockers: ["NO_GENERATED_ASSET_RECEIPT"], catalogStatus: "AWAITING_EXACT_FITMENT_BINDING",
    });
  }
  const counts = {
    queuedVehicles: vehicles.length,
    vehiclesWithGeneratedAssets: vehicles.filter((vehicle) => vehicle.assetStagesPresent > 1).length,
    notStarted: vehicles.filter((vehicle) => vehicle.status === "QUEUED").length,
    draftPacks: vehicles.filter((vehicle) => vehicle.status === "DRAFT_ASSETS").length,
    rejectedPacks: vehicles.filter((vehicle) => vehicle.status === "REJECTED").length,
    transitionReady: vehicles.filter((vehicle) => vehicle.transitionReady).length,
    customerReady: vehicles.filter((vehicle) => vehicle.customerReady).length,
  };
  await writeJsonAtomic(resolve(workspace, "catalog-data/generated/visual-transition-production.json"), {
    schemaVersion: "1.0.0", generatedAt: new Date().toISOString(),
    note: "Only verified local media count. Planned jobs and the Hilux fixture never count as generated transitions for another vehicle.",
    counts, vehicles,
  });
  process.stdout.write(`${JSON.stringify(counts, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
