import Image from "next/image";
import Link from "next/link";
import type {
  ArtifactInspection,
  AssetIdentityComparison,
  InspectionReport,
  MetadataComparison,
} from "@/lib/inspection/inspect";

/**
 * Provera â€” Inspector Mode report view (Phase 7).
 *
 * Renders the report produced by `collectInspection()`: the Cloudinary asset as
 * it exists now, next to the verification record that describes it. Every row
 * states whether it was compared, matched or could not be read â€” nothing is
 * shown as agreeing when the underlying call failed, and the scope note is always
 * visible so the live read is not mistaken for the original analysis.
 */

type Tone = "ok" | "warn" | "bad" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-slate-200 bg-slate-100 text-slate-600",
};

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        {action}
      </div>
      {subtitle ? (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono = true,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 py-1.5 last:border-b-0">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd
        className={`max-w-full break-all text-right text-sm text-slate-900 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">{children}</div>
  );
}

/** Renders an absent value honestly instead of showing a blank cell. */
function shown(value: string | number | null | undefined, fallback = "not recorded") {
  return value === null || value === undefined || value === "" ? (
    <span className="font-sans text-slate-400">{fallback}</span>
  ) : (
    value
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <strong className="font-semibold">Unavailable. </strong>
      {reason}
    </p>
  );
}

function IdentitySection({ identity }: { identity: AssetIdentityComparison }) {
  const tone: Tone =
    identity.outcome === "changed" ? "bad" : identity.outcome === "consistent" ? "ok" : "neutral";
  const label =
    identity.outcome === "changed"
      ? "changed since verification"
      : identity.outcome === "consistent"
        ? "consistent with the record"
        : "not enough to compare";

  return (
    <Section
      title="Asset identity: record vs live Cloudinary"
      subtitle="The record captured this identity when the verification ran. The live column is what Cloudinary returns now."
      action={<Badge tone={tone}>{label}</Badge>}
    >
      <Panel>
        <dl>
          {identity.checks.map((check) => (
            <Row
              key={check.field}
              label={
                <span className="flex items-center gap-2">
                  {check.field}
                  <Badge
                    tone={
                      check.state === "match"
                        ? "ok"
                        : check.state === "mismatch"
                          ? "bad"
                          : "neutral"
                    }
                  >
                    {check.state.replace("_", " ")}
                  </Badge>
                </span>
              }
              value={
                <span className="flex flex-col gap-0.5">
                  <span>{shown(check.recorded)}</span>
                  <span className="text-slate-400">
                    live: {shown(check.live, "not reported")}
                  </span>
                </span>
              }
            />
          ))}
        </dl>
        {identity.notes.length > 0 && (
          <ul className="mt-3 space-y-1.5 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-900">
            {identity.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </Panel>
    </Section>
  );
}

const FIELD_TONE: Record<string, Tone> = {
  match: "ok",
  mismatch: "bad",
  missing: "warn",
  not_compared: "neutral",
};

function MetadataSection({ metadata }: { metadata: MetadataComparison }) {
  return (
    <Section
      title="Structured metadata on the asset"
      subtitle="The seven provera_* fields Provera wrote through the Upload API, compared with the values Cloudinary returns now."
      action={
        <Badge tone={metadata.matches ? "ok" : "bad"}>
          {metadata.matches
            ? `all ${metadata.matchCount} fields match`
            : `${metadata.mismatchCount} mismatched, ${metadata.missingCount} missing`}
        </Badge>
      }
    >
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-semibold">Field</th>
                <th className="py-2 pr-3 font-semibold">Expected (record)</th>
                <th className="py-2 pr-3 font-semibold">Live (Cloudinary)</th>
                <th className="py-2 font-semibold">State</th>
              </tr>
            </thead>
            <tbody>
              {metadata.fields.map((field) => (
                <tr key={field.field} className="border-b border-slate-100 last:border-b-0">
                  <td className="py-2 pr-3 font-mono text-xs text-slate-700">{field.field}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-900">
                    {String(field.expected) === "" ? (
                      <span className="font-sans text-slate-400">empty</span>
                    ) : (
                      String(field.expected)
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-900">
                    {field.live === null ? (
                      <span className="font-sans text-slate-400">not set</span>
                    ) : (
                      field.live
                    )}
                  </td>
                  <td className="py-2">
                    <Badge tone={FIELD_TONE[field.state]}>{field.state}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {metadata.extraLiveFields.length > 0 && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            The asset also carries provera_* fields this record did not write:{" "}
            <span className="font-mono">{metadata.extraLiveFields.join(", ")}</span>. They
            are reported, not removed.
          </p>
        )}
      </Panel>
    </Section>
  );
}

function LiveAssetSection({ report }: { report: InspectionReport }) {
  const { live } = report.asset;
  if (!live.available) {
    return (
      <Section title="Live Cloudinary asset" subtitle="Read now through the Admin API.">
        <Unavailable
          reason={`${live.reason}${
            live.httpStatus ? ` (HTTP ${live.httpStatus})` : ""
          }. The record below is unaffected; only the live view is missing.`}
        />
      </Section>
    );
  }
  const fields = live.fields;
  return (
    <Section
      title="Live Cloudinary asset"
      subtitle="Read now through the Admin API. This is current account state, not a historical snapshot."
      action={
        <a
          href={fields.secureUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-slate-700 underline hover:text-slate-900"
        >
          Open the original
        </a>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <dl>
            <Row label="asset_id" value={shown(fields.assetId, "not reported")} />
            <Row label="public_id" value={shown(fields.publicId, "not reported")} />
            <Row
              label="resource_type / type"
              value={`${shown(fields.resourceType, "?")} / ${shown(fields.deliveryType, "?")}`}
            />
            <Row label="format" value={shown(fields.format, "not reported")} />
            <Row label="version" value={shown(fields.version, "not reported")} />
            <Row label="dimensions" value={shown(`${fields.width}Ã—${fields.height}`, "not reported")} />
            <Row label="bytes" value={shown(fields.bytes, "not reported")} />
            <Row label="created_at" value={shown(fields.createdAt, "not reported")} />
            <Row label="last_updated" value={shown(fields.lastUpdated, "not reported")} />
            <Row label="access_mode" value={shown(fields.accessMode, "not reported by this API")} />
            <Row label="secure_url" value={shown(fields.secureUrl, "not reported")} />
          </dl>
        </Panel>
        <Panel>
          <dl>
            <Row
              label="perceptual hash (pHash)"
              value={shown(fields.phash, "not reported")}
            />
            <Row
              label="EXIF fields"
              value={fields.hasExif ? fields.exifFieldCount : "none present"}
            />
            <Row
              label="image metadata keys"
              value={
                fields.imageMetadataKeys.length > 0
                  ? fields.imageMetadataKeys.join(", ")
                  : "none present"
              }
            />
            <Row
              label="tags"
              value={fields.tags.length > 0 ? fields.tags.join(", ") : "none set"}
            />
            <Row
              label="context"
              value={
                fields.context ? (
                  <ul>
                    {Object.entries(fields.context).map(([key, value]) => (
                      <li key={key} className="text-xs">
                        {key}: {value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "none set"
                )
              }
            />
            <Row
              label="rate limit"
              value={
                fields.rateLimit
                  ? `${shown(fields.rateLimit.remaining, "?")} / ${shown(fields.rateLimit.limit, "?")} remaining`
                  : "not reported"
              }
            />
            <Row
              label="predominant colours"
              value={
                fields.predominantColors.length > 0
                  ? fields.predominantColors
                      .map((color) => `${color.name} ${color.percent}%`)
                      .join(", ")
                  : "none reported"
              }
            />
          </dl>
        </Panel>
      </div>
    </Section>
  );
}

const SIGNAL_LABELS: Record<keyof InspectionReport["record"]["signals"], string> = {
  metadataAvailability: "Metadata availability",
  ocrConsistency: "OCR / claim consistency",
  visualConsistency: "Visual consistency",
  duplicateIndicator: "Duplicate indicator",
  mediaQuality: "Media quality",
};

function SignalsSection({ report }: { report: InspectionReport }) {
  return (
    <Section
      title="Recorded analysis signals"
      subtitle="The normalized signal values stored in the record when it was created. A null value means the capability was unavailable at that time, not that it scored zero."
    >
      <Panel>
        <dl>
          {Object.entries(report.record.signals).map(([key, value]) => (
            <Row
              key={key}
              label={SIGNAL_LABELS[key as keyof InspectionReport["record"]["signals"]]}
              value={
                value === null ? (
                  <span className="font-sans text-slate-500">unavailable</span>
                ) : (
                  `${value} / 100`
                )
              }
            />
          ))}
          <Row label="coverage" value={`${report.record.coverage}%`} />
          <Row label="analysis ID" value={shown(report.record.analysisId, "not recorded")} />
        </dl>
      </Panel>
    </Section>
  );
}

function ArtifactSection({ artifact }: { artifact: ArtifactInspection }) {
  if (artifact.status === "unavailable") {
    return (
      <Section
        title="Artifact transformation"
        subtitle="The signed Cloudinary transformation that renders the record onto the asset."
      >
        <Unavailable reason={artifact.reason} />
      </Section>
    );
  }
  const { artifact: built, delivery } = artifact;
  return (
    <Section
      title="Artifact transformation"
      subtitle="The signed Cloudinary transformation that renders the record onto the asset."
      action={
        <Badge tone={delivery.verified ? "ok" : "bad"}>
          {delivery.verified ? `delivery ${delivery.status}` : "delivery not verified"}
        </Badge>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
          <Image
            src={built.url}
            alt={`Provera verification artifact for record ${built.recordId}`}
            width={built.canvas.width}
            height={built.canvas.height}
            className="h-auto w-full"
          />
        </div>
        <div className="space-y-4">
          <Panel>
            <dl>
              <Row label="artifact version" value={built.artifactVersion} />
              <Row
                label="delivery signature"
                value={built.signature ? `s--${built.signature}--` : "unsigned"}
              />
              <Row
                label="optimization"
                value={`${built.optimization.fetchFormat} / ${built.optimization.quality}`}
              />
              <Row label="canvas" value={`${built.canvas.width}Ã—${built.canvas.height}`} />
              <Row label="QR composited" value={built.hasQr ? "yes" : "no"} />
              <Row label="verification URL" value={built.verificationUrl} />
              <Row label="content type" value={shown(delivery.contentType, "not reported")} />
              <Row
                label="content length"
                value={shown(delivery.contentLength, "not reported")}
              />
            </dl>
          </Panel>
          <Panel>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Transformation parameters
            </h3>
            <ol className="mt-2 space-y-2">
              {built.layers.map((layer, index) => (
                <li key={`${layer.parameters}-${index}`} className="text-xs">
                  <span className="font-mono text-slate-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>{" "}
                  <span className="text-slate-700">{layer.purpose}</span>
                  <br />
                  <span className="break-all font-mono text-slate-500">
                    {layer.parameters}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 break-all border-t border-slate-100 pt-2 font-mono text-[11px] text-slate-500">
              {built.url}
            </p>
          </Panel>
        </div>
      </div>
    </Section>
  );
}

function QrSection({ report }: { report: InspectionReport }) {
  const { qr } = report;
  if (qr.failure) {
    return (
      <Section title="Verification QR" subtitle="The overlay source composited onto the artifact.">
        <Unavailable reason={qr.failure} />
      </Section>
    );
  }
  if (!qr.asset) {
    return (
      <Section title="Verification QR" subtitle="The overlay source composited onto the artifact.">
        <Unavailable reason="No QR asset was produced for this inspection." />
      </Section>
    );
  }
  return (
    <Section
      title="Verification QR"
      subtitle="The overlay source composited onto the artifact, stored as its own Cloudinary asset so the CDN can fetch it."
      action={
        qr.live?.available ? (
          <Badge tone="ok">stored in Cloudinary</Badge>
        ) : (
          <Badge tone="warn">not confirmed in Cloudinary</Badge>
        )
      }
    >
      <div className="grid gap-4 lg:grid-cols-[12rem_1fr]">
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <Image
            src={qr.asset.url}
            alt={`QR code to the verification page for record ${report.record.recordId}`}
            width={qr.asset.size}
            height={qr.asset.size}
            className="h-auto w-full"
          />
        </div>
        <Panel>
          <dl>
            <Row label="public_id" value={qr.asset.publicId} />
            <Row label="destination" value={qr.asset.destination} />
            <Row label="modules" value={`${qr.asset.moduleCount}Ã—${qr.asset.moduleCount}`} />
            <Row label="png size" value={`${qr.asset.size}Ã—${qr.asset.size} px`} />
            <Row label="version" value={qr.asset.version} />
            {qr.live?.available ? (
              <>
                <Row label="stored bytes" value={shown(qr.live.bytes, "not reported")} />
                <Row
                  label="tags"
                  value={qr.live.tags.length > 0 ? qr.live.tags.join(", ") : "none set"}
                />
                <Row
                  label="context"
                  value={
                    qr.live.context
                      ? Object.entries(qr.live.context)
                          .map(([key, value]) => `${key}=${value}`)
                          .join("  ")
                      : "none set"
                  }
                />
              </>
            ) : (
              <Row
                label="Cloudinary read"
                value={
                  <span className="font-sans text-amber-800">
                    {qr.live ? qr.live.reason : "not read"}
                  </span>
                }
                mono={false}
              />
            )}
          </dl>
        </Panel>
      </div>
    </Section>
  );
}

function DerivativesSection({ report }: { report: InspectionReport }) {
  const { derivatives } = report;
  return (
    <Section
      title="Derivatives Cloudinary generated"
      subtitle="Cached derived images whose transformation carries this record's evidence in a text layer. This is Cloudinary's own record that the transformation really ran."
      action={
        <Badge tone={derivatives.matching > 0 ? "ok" : "neutral"}>
          {derivatives.matching} of {derivatives.total} derivatives
        </Badge>
      }
    >
      {derivatives.entries.length === 0 ? (
        <Panel>
          <p className="text-sm text-slate-600">
            No cached derivative mentioning {report.record.recordId} was reported. A
            derived image is only created once its URL has been requested, so an empty
            list is expected before the artifact is first fetched.
          </p>
        </Panel>
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Format</th>
                  <th className="py-2 pr-3 font-semibold">Bytes</th>
                  <th className="py-2 pr-3 font-semibold">Components</th>
                  <th className="py-2 font-semibold">Transformation signature</th>
                </tr>
              </thead>
              <tbody>
                {derivatives.entries.map((entry, index) => (
                  <tr key={entry.id ?? index} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {entry.secureUrl ? (
                        <a
                          href={entry.secureUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-slate-700"
                        >
                          {shown(entry.format, "?")}
                        </a>
                      ) : (
                        shown(entry.format, "?")
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{shown(entry.bytes, "?")}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{entry.componentCount}</td>
                    <td className="py-2 font-mono text-[11px] text-slate-500">
                      {shown(entry.transformationSignature, "not reported")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {derivatives.truncated && (
            <p className="mt-2 text-xs text-slate-500">
              Showing the {derivatives.entries.length} largest of{" "}
              {derivatives.matching} matching derivatives.
            </p>
          )}
        </Panel>
      )}
    </Section>
  );
}

export default function InspectionReportView({
  report,
}: {
  report: InspectionReport;
}) {
  const { record } = report;
  const statusTone: Tone =
    record.status === "VERIFIED" ? "ok" : record.status === "REVIEW" ? "warn" : "bad";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Inspector Mode
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Cloudinary workflow for {record.recordId}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Read live at {report.generatedAt} Â· report {report.inspectionVersion}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone}>{record.status}</Badge>
          <Badge tone="neutral">score {record.score}</Badge>
          <Badge tone={record.integrityVerified ? "ok" : "bad"}>
            {record.integrityVerified ? "record hash verified" : "record hash altered"}
          </Badge>
        </div>
      </div>

      <p className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">
        {report.scope}
      </p>

      <Section
        title="Verification record"
        subtitle="The stored record this inspection is about. Its integrity hash is recomputed on every visit."
        action={
          <Link
            href={`/verify/${record.recordId}`}
            className="text-xs font-medium text-slate-700 underline hover:text-slate-900"
          >
            Public verification page
          </Link>
        }
      >
        <Panel>
          <dl>
            <Row label="record ID" value={record.recordId} />
            <Row label="record schema" value={record.schemaVersion} />
            <Row label="engine version" value={record.engineVersion} />
            <Row label="recorded at" value={record.timestamp} />
            <Row label="status" value={record.status} />
            <Row label="score" value={`${record.score} / 100`} />
            <Row label="coverage" value={`${record.coverage}%`} />
            <Row label="record hash" value={record.recordHash} />
            <Row label="asset public ID" value={report.asset.recorded.publicId} />
            <Row
              label="submitted claim"
              value={
                record.context ? (
                  <span className="font-sans">{record.context}</span>
                ) : (
                  <span className="font-sans text-slate-400">none supplied</span>
                )
              }
            />
          </dl>
        </Panel>
      </Section>

      <IdentitySection identity={report.asset.identity} />
      <LiveAssetSection report={report} />
      <MetadataSection metadata={report.metadata} />
      <SignalsSection report={report} />
      <ArtifactSection artifact={report.artifact} />
      <QrSection report={report} />
      <DerivativesSection report={report} />

      <footer className="mt-10 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500">
        <span>Provera Â· Inspector Mode</span>
        <Link
          href={`/api/inspector/${report.record.recordId}`}
          className="font-medium underline hover:text-slate-900"
        >
          This report as JSON
        </Link>
        <Link
          href={`/api/verify/${report.record.recordId}`}
          className="font-medium underline hover:text-slate-900"
        >
          Raw record JSON
        </Link>
        <Link href="/" className="font-medium underline hover:text-slate-900">
          Start a new verification
        </Link>
      </footer>
    </main>
  );
}

