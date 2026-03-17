import { useRef, useState } from "react";

const MAX_FILE_SIZE = 1_000_000; // 1MB

async function extractPdfServer(file: File): Promise<string> {
	const res = await fetch("/api/extract-pdf", {
		method: "POST",
		headers: { "Content-Type": "application/pdf" },
		body: file,
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: "Server error" }));
		throw new Error(err.error ?? `Server returned ${res.status}`);
	}
	const { text } = await res.json();
	return text ?? "";
}

async function extractText(file: File): Promise<string> {
	if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
		return extractPdfServer(file);
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
				setError(
					"Couldn't extract text from this file. Try pasting the content instead.",
				);
				return;
			}
			onExtracted(text, file.name);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			setError(
				`Couldn't extract text from this PDF (${errMsg}). Try pasting the content instead.`,
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
