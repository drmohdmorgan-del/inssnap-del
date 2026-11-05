/**
 * Profile cards ported from the mobile-web surfaces (2026-11-05
 * pilot-readiness: the Expo app was missing both Nov-3 cards):
 *
 *   - ReadyCard         ← web /m/prospect ReadyCard (Prospective
 *                         "Ready" tier: pre-assembled packet; speed,
 *                         never pre-approval).
 *   - BrokerTierCard    ← web /m/broker TierCard (subscription tiers,
 *                         free self-serve selection during the pilot).
 *   - BrokerLicenseCard ← web /m/broker LicenseCard (license vetting:
 *                         no verified license = no lead assignments).
 *
 * Same APIs, same copy, same rules — rendered with the Expo UI
 * primitives and the strict brand palette. Every card is additive:
 * if its endpoint fails, the card renders nothing and the role's
 * core workflow (queues, requests) is unaffected.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { InssnappClient } from "../api/client";
import type {
  BrokerLicenseInfo,
  BrokerTierInfo,
  ProspectPacket,
} from "../api/types";
import {
  Body,
  Button,
  Card,
  Muted,
  Subtitle,
  TextField,
  ToggleRow,
  theme,
} from "../ui/components";
import { actionMessage } from "./shared";

function StatusPill({ label }: { label: string }) {
  return (
    <View
      style={{
        backgroundColor: theme.badgeBg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: theme.ink }}>{label}</Text>
    </View>
  );
}

function CardHeader({ title, pill }: { title: string; pill?: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 8,
      }}
    >
      <Subtitle>{title}</Subtitle>
      {pill ? <StatusPill label={pill} /> : null}
    </View>
  );
}

function CheckRow({ done, label }: { done: boolean; label: string }) {
  return (
    <Muted>
      {done ? "✓ " : "○ "}
      {label}
    </Muted>
  );
}

// ---------------------------------------------------------------------------
// Prospect — Ready packet
// ---------------------------------------------------------------------------

const DOC_SLOTS: { type: string; label: string }[] = [
  { type: "government_id", label: "Government ID" },
  { type: "proof_of_income", label: "Proof of income" },
  { type: "rental_history", label: "Rental history" },
];

export function ReadyCard({ client }: { client: InssnappClient }) {
  const [view, setView] = useState<ProspectPacket | null>(null);
  const [form, setForm] = useState({
    moveInDate: "",
    occupants: "",
    employmentStatus: "",
    incomeRange: "",
  });
  const [docs, setDocs] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await client.myProspectPacket();
      setView(data);
      setForm({
        moveInDate: data.application.moveInDate ?? "",
        occupants: data.application.occupants?.toString() ?? "",
        employmentStatus: data.application.employmentStatus ?? "",
        incomeRange: data.application.incomeRange ?? "",
      });
      setDocs(new Set(data.documents.map((d) => d.type)));
    } catch {
      // Card is additive.
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(tier?: "base" | "ready") {
    setBusy(true);
    setError(null);
    try {
      const data = await client.saveProspectPacket({
        ...(tier ? { tier } : {}),
        moveInDate: form.moveInDate || undefined,
        occupants: form.occupants ? Number(form.occupants) : undefined,
        employmentStatus: form.employmentStatus || undefined,
        incomeRange: form.incomeRange || undefined,
        documents: [...docs],
      });
      setView(data);
    } catch (err) {
      setError(actionMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!view) return null;
  const r = view.readiness;

  return (
    <Card>
      <CardHeader
        title={view.tier === "ready" ? "Ready packet" : "Get Ready — skip the scramble"}
        pill={
          view.tier === "ready"
            ? r.packetAssembled
              ? "Your application is Ready"
              : "in progress"
            : undefined
        }
      />
      <Muted>
        Ready is speed, not a shortcut past review: screening done once, documents and
        financials loaded, application complete — so you can submit the instant a unit
        drops. Management still vets and decides every application.
      </Muted>
      <View style={{ height: 8 }} />
      <CheckRow done={r.applicationComplete} label="Application complete" />
      <CheckRow done={r.documentsLoaded} label="Documents on record" />
      <CheckRow
        done={r.screeningCompleted}
        label={
          r.screeningCompleted
            ? `Screening on file (${r.screeningStatus})`
            : "Screening — completed once management runs it after your consent"
        }
      />
      <View style={{ height: 8 }} />
      <TextField
        label="Move-in date (YYYY-MM-DD)"
        value={form.moveInDate}
        onChangeText={(v) => setForm({ ...form, moveInDate: v })}
        placeholder="2026-12-01"
        autoCapitalize="none"
      />
      <TextField
        label="Occupants"
        value={form.occupants}
        onChangeText={(v) => setForm({ ...form, occupants: v })}
        placeholder="2"
        keyboardType="numeric"
      />
      <TextField
        label="Employment"
        value={form.employmentStatus}
        onChangeText={(v) => setForm({ ...form, employmentStatus: v })}
        placeholder="Employed full-time"
      />
      <TextField
        label="Income range"
        value={form.incomeRange}
        onChangeText={(v) => setForm({ ...form, incomeRange: v })}
        placeholder="$60k–$80k"
      />
      {DOC_SLOTS.map((slot) => (
        <ToggleRow
          key={slot.type}
          label={slot.label}
          hint="I have this ready to present"
          value={docs.has(slot.type)}
          onChange={(on) => {
            const next = new Set(docs);
            if (on) next.add(slot.type);
            else next.delete(slot.type);
            setDocs(next);
          }}
        />
      ))}
      {error ? <Body>{error}</Body> : null}
      <Button
        label={busy ? "…" : "Save packet"}
        onPress={() => void save()}
        disabled={busy}
      />
      {view.tier === "base" ? (
        <Button
          label={busy ? "…" : "Go Ready (free in pilot)"}
          kind="secondary"
          onPress={() => void save("ready")}
          disabled={busy}
        />
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Broker — subscription tier
// ---------------------------------------------------------------------------

export function BrokerTierCard({ client }: { client: InssnappClient }) {
  const [info, setInfo] = useState<BrokerTierInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await client.myBrokerTier());
    } catch {
      // Card is additive.
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function selectTier(id: string) {
    setBusy(true);
    setError(null);
    try {
      await client.selectBrokerTier(id);
      await load();
    } catch (err) {
      setError(actionMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!info) return null;
  const current = info.tiers[info.tier];
  const pct = info.limit ? Math.min(100, Math.round((info.used / info.limit) * 100)) : 0;

  return (
    <Card>
      <CardHeader
        title={`Subscription · ${current?.name ?? info.tier}`}
        pill={info.trialExpired ? "Trial expired" : undefined}
      />
      <Muted>
        {info.limit === null
          ? `${info.used} leads · unlimited`
          : `${info.used} of ${info.limit} leads used`}
        {!info.canAcceptMore ? " — limit reached" : ""}
      </Muted>
      {info.limit !== null ? (
        <View
          style={{
            height: 8,
            borderRadius: 999,
            backgroundColor: theme.secondaryBg,
            marginTop: 8,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 8,
              width: `${pct}%`,
              backgroundColor: info.canAcceptMore ? theme.brandViolet : theme.brandNavy,
            }}
          />
        </View>
      ) : null}
      {error ? <Body>{error}</Body> : null}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        {Object.values(info.tiers).map((t) => {
          const selected = t.id === info.tier;
          return (
            <Pressable
              key={t.id}
              onPress={() => void selectTier(t.id)}
              disabled={busy || selected}
              style={{
                flex: 1,
                borderWidth: 2,
                borderColor: selected ? theme.brandViolet : theme.border,
                backgroundColor: selected ? theme.badgeBg : theme.card,
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 6,
                alignItems: "center",
                opacity: busy && !selected ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.ink }}>
                {t.name}
              </Text>
              <Text style={{ fontSize: 11, color: theme.muted, textAlign: "center" }}>
                {t.leadLimit === null ? "Unlimited" : `${t.leadLimit} leads`}
                {t.trialDays ? ` · ${t.trialDays}d free` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Muted>Pilot: tier selection is free — no payment provider connected yet.</Muted>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Broker — license vetting
// ---------------------------------------------------------------------------

export function BrokerLicenseCard({ client }: { client: InssnappClient }) {
  const [info, setInfo] = useState<BrokerLicenseInfo | null>(null);
  const [number, setNumber] = useState("");
  const [state, setState] = useState("MA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await client.myBrokerLicense());
    } catch {
      // Card is additive; the queue works without it.
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await client.submitBrokerLicense(number.trim(), state);
      await load();
    } catch (err) {
      setError(actionMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!info) return null;
  const canSubmit = info.licenseStatus === "none" || info.licenseStatus === "rejected";

  return (
    <Card>
      <CardHeader title="Broker license" pill={info.licenseStatus} />
      {info.licenseStatus === "verified" ? (
        <Muted>
          License {info.licenseNumber} ({info.licenseState}) verified
          {info.registry ? ` with the ${info.registry.authority}` : ""}. You can receive
          lead assignments.
        </Muted>
      ) : null}
      {info.licenseStatus === "pending" ? (
        <Muted>
          License {info.licenseNumber} ({info.licenseState}) is awaiting verification by
          management. Lead assignments unlock once it verifies.
        </Muted>
      ) : null}
      {info.licenseStatus === "none" ? (
        <Muted>
          Submit your real-estate license for verification — you cannot receive lead
          assignments until management verifies it against the state registry.
        </Muted>
      ) : null}
      {info.licenseStatus === "rejected" ? (
        <Body>
          Your license submission was rejected
          {info.licenseReviewNote ? `: ${info.licenseReviewNote}` : ""}. Check the number
          and resubmit.
        </Body>
      ) : null}
      {canSubmit ? (
        <View>
          <TextField
            label="License number"
            value={number}
            onChangeText={setNumber}
            placeholder="License number"
            autoCapitalize="none"
          />
          <TextField
            label="State"
            value={state}
            onChangeText={(v) => setState(v.toUpperCase().slice(0, 2))}
            placeholder="MA"
            maxLength={2}
          />
          {error ? <Body>{error}</Body> : null}
          <Button
            label={busy ? "Submitting…" : "Submit for verification"}
            onPress={() => void submit()}
            disabled={busy || !number.trim() || state.length !== 2}
          />
        </View>
      ) : null}
    </Card>
  );
}
