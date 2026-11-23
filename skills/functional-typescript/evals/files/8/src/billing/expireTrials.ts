// src/billing/expireTrials.ts
import { db } from "../db";
import { mailer } from "../mailer";

export type Trial = {
  accountId: string;
  email: string;
  startedAt: Date;
  status: "active" | "expired" | "converted";
  remindedAt: Date | null;
};

const TRIAL_DAYS = 14;
const REMIND_DAYS_BEFORE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function runTrialExpiry(): Promise<void> {
  const trials: Trial[] = await db.trials.findByStatus("active");

  for (const trial of trials) {
    const ageDays = Math.floor((Date.now() - trial.startedAt.getTime()) / DAY_MS);

    if (ageDays >= TRIAL_DAYS) {
      trial.status = "expired";
      await db.trials.save(trial);
      await mailer.send(trial.email, "Your trial has ended");
      continue;
    }

    if (ageDays >= TRIAL_DAYS - REMIND_DAYS_BEFORE && trial.remindedAt === null) {
      trial.remindedAt = new Date();
      await db.trials.save(trial);
      await mailer.send(trial.email, `Your trial ends in ${TRIAL_DAYS - ageDays} days`);
    }
  }
}
