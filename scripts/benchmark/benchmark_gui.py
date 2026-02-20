#!/usr/bin/env python3
import json
from pathlib import Path
from tkinter import Tk, StringVar, DoubleVar, filedialog, messagebox
from tkinter import ttk


BENCH_ROOT = Path("reports/benchmarks")


def pct_delta(before: float, after: float) -> float:
    if before == 0 and after == 0:
        return 0.0
    if before == 0:
        return 100.0
    return ((after - before) / before) * 100.0


def flatten_metrics(data: dict) -> list[dict]:
    modules = data.get("modules", {})
    rows: list[dict] = []
    for module_name in ("apiCore", "apiWrite", "uiPages"):
        module = modules.get(module_name, {})
        for metric in module.get("endpointMetrics", []):
            row = dict(metric)
            row["_module"] = module_name
            rows.append(row)
    return rows


def summarize_statuses(metrics: list[dict]) -> dict:
    statuses: dict[str, int] = {}
    for metric in metrics:
        for code, count in metric.get("statuses", {}).items():
            statuses[code] = statuses.get(code, 0) + int(count)
    return dict(sorted(statuses.items(), key=lambda kv: kv[0]))


class BenchmarkGui:
    def __init__(self, root: Tk):
        self.root = root
        self.root.title("Benchmark Viewer")
        self.root.geometry("1300x760")

        self.current_data: dict | None = None
        self.baseline_data: dict | None = None

        self.current_path_var = StringVar(value="")
        self.baseline_path_var = StringVar(value="")
        self.threshold_var = DoubleVar(value=5.0)

        self.meta_labels: dict[str, ttk.Label] = {}
        self.metrics_tree: ttk.Treeview | None = None
        self.edge_tree: ttk.Treeview | None = None
        self.compare_tree: ttk.Treeview | None = None
        self.summary_text: ttk.Label | None = None

        self._build_ui()

    def _build_ui(self):
        controls = ttk.Frame(self.root, padding=10)
        controls.pack(fill="x")

        ttk.Label(controls, text="Current raw.json:").grid(row=0, column=0, sticky="w")
        ttk.Entry(controls, textvariable=self.current_path_var, width=90).grid(row=0, column=1, padx=6, sticky="we")
        ttk.Button(controls, text="Browse", command=self.pick_current_file).grid(row=0, column=2, padx=4)
        ttk.Button(controls, text="Load Latest", command=self.load_latest).grid(row=0, column=3, padx=4)

        ttk.Label(controls, text="Baseline raw.json:").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(controls, textvariable=self.baseline_path_var, width=90).grid(row=1, column=1, padx=6, sticky="we", pady=(8, 0))
        ttk.Button(controls, text="Browse", command=self.pick_baseline_file).grid(row=1, column=2, padx=4, pady=(8, 0))
        ttk.Button(controls, text="Clear", command=self.clear_baseline).grid(row=1, column=3, padx=4, pady=(8, 0))

        ttk.Label(controls, text="Neutral threshold %:").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(controls, textvariable=self.threshold_var, width=10).grid(row=2, column=1, sticky="w", pady=(8, 0))
        ttk.Button(controls, text="Load/Refresh", command=self.refresh_all).grid(row=2, column=3, sticky="e", pady=(8, 0))
        controls.columnconfigure(1, weight=1)

        notebook = ttk.Notebook(self.root)
        notebook.pack(fill="both", expand=True, padx=10, pady=10)

        overview = ttk.Frame(notebook, padding=10)
        notebook.add(overview, text="Overview")
        self._build_overview_tab(overview)

        metrics = ttk.Frame(notebook, padding=10)
        notebook.add(metrics, text="Metrics")
        self._build_metrics_tab(metrics)

        edge = ttk.Frame(notebook, padding=10)
        notebook.add(edge, text="Edge Checks")
        self._build_edge_tab(edge)

        compare = ttk.Frame(notebook, padding=10)
        notebook.add(compare, text="Compare")
        self._build_compare_tab(compare)

    def _build_overview_tab(self, tab: ttk.Frame):
        meta = ttk.LabelFrame(tab, text="Run Metadata", padding=10)
        meta.pack(fill="x")
        for i, key in enumerate(["runId", "timestampIso", "runtimeLabel", "targetBaseUrl", "gitCommit", "nodeVersion"]):
            ttk.Label(meta, text=f"{key}:").grid(row=i, column=0, sticky="w")
            label = ttk.Label(meta, text="-")
            label.grid(row=i, column=1, sticky="w", padx=8)
            self.meta_labels[key] = label

        summary = ttk.LabelFrame(tab, text="Summary", padding=10)
        summary.pack(fill="both", expand=True, pady=(10, 0))
        self.summary_text = ttk.Label(summary, text="-", justify="left")
        self.summary_text.pack(anchor="nw")

    def _build_metrics_tab(self, tab: ttk.Frame):
        cols = ("module", "endpoint", "tier", "p95", "avg", "rps", "err", "statuses")
        tree = ttk.Treeview(tab, columns=cols, show="headings")
        for col, title, width in [
            ("module", "Module", 100),
            ("endpoint", "Endpoint", 220),
            ("tier", "Tier", 80),
            ("p95", "P95 ms", 90),
            ("avg", "Avg ms", 90),
            ("rps", "RPS", 90),
            ("err", "Error %", 90),
            ("statuses", "Status Codes", 180),
        ]:
            tree.heading(col, text=title)
            tree.column(col, width=width, anchor="w")
        tree.pack(fill="both", expand=True)
        self.metrics_tree = tree

    def _build_edge_tab(self, tab: ttk.Frame):
        cols = ("name", "passed", "details")
        tree = ttk.Treeview(tab, columns=cols, show="headings")
        tree.heading("name", text="Check")
        tree.heading("passed", text="Result")
        tree.heading("details", text="Details")
        tree.column("name", width=320, anchor="w")
        tree.column("passed", width=90, anchor="w")
        tree.column("details", width=780, anchor="w")
        tree.pack(fill="both", expand=True)
        self.edge_tree = tree

    def _build_compare_tab(self, tab: ttk.Frame):
        cols = ("endpoint", "tier", "p95_before", "p95_now", "p95_delta", "rps_delta", "err_delta", "status")
        tree = ttk.Treeview(tab, columns=cols, show="headings")
        headings = [
            ("endpoint", "Endpoint", 220),
            ("tier", "Tier", 80),
            ("p95_before", "P95 Before", 100),
            ("p95_now", "P95 Now", 100),
            ("p95_delta", "P95 Δ%", 90),
            ("rps_delta", "RPS Δ%", 90),
            ("err_delta", "Err Δ%", 90),
            ("status", "Status", 110),
        ]
        for col, title, width in headings:
            tree.heading(col, text=title)
            tree.column(col, width=width, anchor="w")
        tree.pack(fill="both", expand=True)
        self.compare_tree = tree

    def pick_current_file(self):
        file_path = filedialog.askopenfilename(
            title="Select current raw.json",
            initialdir=str(BENCH_ROOT),
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
        )
        if file_path:
            self.current_path_var.set(file_path)

    def pick_baseline_file(self):
        file_path = filedialog.askopenfilename(
            title="Select baseline raw.json",
            initialdir=str(BENCH_ROOT),
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
        )
        if file_path:
            self.baseline_path_var.set(file_path)

    def clear_baseline(self):
        self.baseline_path_var.set("")
        self.baseline_data = None
        self._fill_compare([])

    def load_latest(self):
        latest_path = BENCH_ROOT / "latest" / "raw.json"
        if not latest_path.exists():
            messagebox.showerror("Missing file", f"Cannot find {latest_path}")
            return
        self.current_path_var.set(str(latest_path))
        self.refresh_all()

    def _load_json(self, path_text: str) -> dict:
        p = Path(path_text)
        if not p.exists():
            raise FileNotFoundError(path_text)
        with p.open("r", encoding="utf-8") as f:
            return json.load(f)

    def refresh_all(self):
        try:
            current_path = self.current_path_var.get().strip()
            if not current_path:
                messagebox.showerror("Missing input", "Select current raw.json first.")
                return

            self.current_data = self._load_json(current_path)
            baseline_path = self.baseline_path_var.get().strip()
            self.baseline_data = self._load_json(baseline_path) if baseline_path else None

            self._fill_overview()
            self._fill_metrics()
            self._fill_edge_checks()
            self._fill_compare(self._compute_compare_rows() if self.baseline_data else [])
        except Exception as exc:
            messagebox.showerror("Load error", str(exc))

    def _fill_overview(self):
        if not self.current_data:
            return
        meta = self.current_data.get("metadata", {})
        for key, label in self.meta_labels.items():
            label.configure(text=str(meta.get(key, "-")))

        metrics = flatten_metrics(self.current_data)
        statuses = summarize_statuses(metrics)
        total = len(metrics)
        bad_429 = statuses.get("429", 0)
        text = f"Endpoint metric rows: {total}\nAggregate statuses: {statuses}\n"
        if bad_429 > 0:
            text += "Warning: 429 responses detected. Results are influenced by rate limiting.\n"
        self.summary_text.configure(text=text)

    def _fill_metrics(self):
        if not self.metrics_tree or not self.current_data:
            return
        tree = self.metrics_tree
        for iid in tree.get_children():
            tree.delete(iid)
        for metric in sorted(flatten_metrics(self.current_data), key=lambda x: (x["_module"], x["endpointName"], x["tier"])):
            tree.insert(
                "",
                "end",
                values=(
                    metric["_module"],
                    metric.get("endpointName", ""),
                    metric.get("tier", ""),
                    f"{float(metric.get('p95Ms', 0)):.2f}",
                    f"{float(metric.get('avgMs', 0)):.2f}",
                    f"{float(metric.get('throughputRps', 0)):.2f}",
                    f"{float(metric.get('errorRatePct', 0)):.2f}",
                    ",".join(sorted(metric.get("statuses", {}).keys())),
                ),
            )

    def _fill_edge_checks(self):
        if not self.edge_tree or not self.current_data:
            return
        tree = self.edge_tree
        for iid in tree.get_children():
            tree.delete(iid)
        checks = self.current_data.get("modules", {}).get("edgeChecks", {}).get("checks", [])
        for check in checks:
            tree.insert(
                "",
                "end",
                values=(
                    check.get("name", ""),
                    "PASS" if check.get("passed") else "FAIL",
                    json.dumps(check.get("details", {}), ensure_ascii=True),
                ),
            )

    def _compute_compare_rows(self):
        if not self.current_data or not self.baseline_data:
            return []
        threshold = float(self.threshold_var.get())
        current_map = {
            (m.get("endpointName"), m.get("path"), m.get("tier")): m
            for m in flatten_metrics(self.current_data)
        }
        base_map = {
            (m.get("endpointName"), m.get("path"), m.get("tier")): m
            for m in flatten_metrics(self.baseline_data)
        }
        rows = []
        for key, current in sorted(current_map.items()):
            base = base_map.get(key)
            if not base:
                continue
            p95_d = pct_delta(float(base.get("p95Ms", 0)), float(current.get("p95Ms", 0)))
            rps_d = pct_delta(float(base.get("throughputRps", 0)), float(current.get("throughputRps", 0)))
            err_d = pct_delta(float(base.get("errorRatePct", 0)), float(current.get("errorRatePct", 0)))

            if p95_d <= -threshold and rps_d >= -threshold and err_d <= threshold:
                status = "improved"
            elif p95_d >= threshold or rps_d <= -threshold or err_d >= threshold:
                status = "regressed"
            else:
                status = "neutral"
            rows.append(
                (
                    str(key[0]),
                    str(key[2]),
                    f"{float(base.get('p95Ms', 0)):.2f}",
                    f"{float(current.get('p95Ms', 0)):.2f}",
                    f"{p95_d:.2f}%",
                    f"{rps_d:.2f}%",
                    f"{err_d:.2f}%",
                    status,
                )
            )
        return rows

    def _fill_compare(self, rows):
        if not self.compare_tree:
            return
        tree = self.compare_tree
        for iid in tree.get_children():
            tree.delete(iid)
        for row in rows:
            tree.insert("", "end", values=row)


def main():
    root = Tk()
    app = BenchmarkGui(root)
    app.load_latest()
    root.mainloop()


if __name__ == "__main__":
    main()
