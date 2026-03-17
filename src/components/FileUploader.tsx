import { useRef, useState } from "react";

const MAX_FILE_SIZE = 1_000_000; // 1MB

function logToServer(
	level: "error" | "warn",
	message: string,
	detail?: string,
) {
	fetch("/api/log", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ level, message, detail }),
	}).catch(() => {});
}

async function parsePdf(
	pdfjsLib: typeof import("pdfjs-dist"),
	data: ArrayBuffer,
): Promise<string> {
	const pdf = await pdfjsLib.getDocument({ data }).promise;
	const pages: string[] = [];

	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const content = await page.getTextContent();
		pages.push(
			content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
		);
	}

	return pages.join("\n\n");
}

async function extractPdfText(file: File): Promise<string> {
	let pdfjsLib: typeof import("pdfjs-dist");
	try {
		pdfjsLib = await import("pdfjs-dist");
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logToServer("error", "Failed to import pdfjs-dist", msg);
		throw err;
	}

	let arrayBuffer: ArrayBuffer;
	try {
		arrayBuffer = await file.arrayBuffer();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logToServer(
			"error",
			"file.arrayBuffer() failed",
			`file=${file.name} size=${file.size} error=${msg}`,
		);
		throw err;
	}

	// Try with web worker first (faster, works on desktop browsers)
	try {
		const workerModule =
			await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
		pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
		return await parsePdf(pdfjsLib, arrayBuffer);
	} catch (workerErr) {
		const workerMsg =
			workerErr instanceof Error ? workerErr.message : String(workerErr);
		logToServer(
			"warn",
			"PDF worker extraction failed, trying fallback",
			workerMsg,
		);
		// Module workers unsupported on iOS WebKit — load worker code on main thread.
		// Setting globalThis.pdfjsWorker lets pdfjs-dist skip Worker creation entirely
		// and use its built-in "fake worker" (main-thread) path.
		// Re-read file because the original ArrayBuffer was transferred to the failed worker.
		try {
			const worker = await import(
				/* @vite-ignore */ "pdfjs-dist/build/pdf.worker.min.mjs"
			);
			(globalThis as Record<string, unknown>).pdfjsWorker = worker;
			const freshBuffer = await file.arrayBuffer();
			return await parsePdf(pdfjsLib, freshBuffer);
		} catch (fallbackErr) {
			const fbMsg =
				fallbackErr instanceof Error
					? fallbackErr.message
					: String(fallbackErr);
			logToServer("error", "PDF main-thread fallback also failed", fbMsg);
			throw fallbackErr;
		}
	}
}

async function extractText(file: File): Promise<string> {
	if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
		return extractPdfText(file);
	}
	return file.text();
}

interface Props {
	onExtracted: (text: string, fileName: string) => void;
	label?: string;
}

export default function FileUploader({
	onExtracted,
	label = "Upload PDF/TXT",
}: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleFile = async (file: File) => {
		setError("");

		if (file.size > MAX_FILE_SIZE) {
			setError("File must be under 1MB");
			return;
		}

		setLoading(true);
		try {
			const text = await extractText(file);
			if (!text.trim()) {
				const detail = `file=${file.name} type=${file.type} size=${file.size}`;
				logToServer("error", "PDF extraction returned empty text", detail);
				setError(
					"Couldn't extract text from this file. Try pasting the content instead.",
				);
				return;
			}
			onExtracted(text, file.name);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			const detail = `file=${file.name} type=${file.type} size=${file.size} error=${errMsg}`;
			logToServer("error", "PDF extraction threw", detail);
			setError(
				`Couldn't extract text from this PDF. Try pasting the content instead.`,
			);
		} finally {
			setLoading(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	};

	return (
		<div>
			<input
				ref={inputRef}
				type="file"
				accept=".pdf,.txt"
				style={{ display: "none" }}
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) handleFile(file);
				}}
			/>
			<button
				onClick={() => inputRef.current?.click()}
				disabled={loading}
				style={styles.uploadButton}
			>
				{loading ? "Extracting..." : label}
			</button>
			{error && <p style={styles.error}>{error}</p>}
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	uploadButton: {
		background: "transparent",
		color: "var(--text-muted)",
		border: "1px dashed #475569",
		borderRadius: 6,
		padding: "6px 10px",
		fontSize: "0.75rem",
		cursor: "pointer",
		width: "100%",
		marginTop: 4,
	},
	error: {
		color: "var(--danger)",
		fontSize: "0.7rem",
		marginTop: 4,
	},
};
