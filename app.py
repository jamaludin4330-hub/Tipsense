import json
import math
from pathlib import Path

import joblib
import pandas as pd
from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__)

# Muat model, metrik, dan data satu kali saat aplikasi mulai
model = joblib.load(BASE_DIR / "model" / "model_tip.joblib")
with open(BASE_DIR / "model" / "metrics.json", encoding="utf-8") as f:
    METRICS = json.load(f)
df = pd.read_csv(BASE_DIR / "data" / "tips.csv")

X_MIN = METRICS["x_min"]
X_MAX = METRICS["x_max"]
MAX_INPUT = 1000  # batas atas input agar masuk akal


def predict_tip(total_bill: float) -> float:
    """Prediksi tip dari total tagihan (nilai tidak boleh negatif)."""
    data = pd.DataFrame({"total_bill": [total_bill]})
    return max(float(model.predict(data)[0]), 0.0)


@app.route("/")
def index():
    stats = {
        "rows": int(df.shape[0]),
        "cols": int(df.shape[1]),
        "bill_mean": round(float(df["total_bill"].mean()), 2),
        "tip_mean": round(float(df["tip"].mean()), 2),
    }
    preview = df.head(8).to_dict(orient="records")
    columns = list(df.columns)
    return render_template(
        "index.html", metrics=METRICS, stats=stats, preview=preview, columns=columns
    )


@app.route("/predict", methods=["POST"])
def predict():
    payload = request.get_json(silent=True) or {}
    raw = payload.get("total_bill")

    try:
        total_bill = float(raw)
    except (TypeError, ValueError):
        return jsonify(error="Total tagihan harus berupa angka."), 400

    if math.isnan(total_bill) or math.isinf(total_bill):
        return jsonify(error="Total tagihan tidak valid."), 400
    if total_bill <= 0:
        return jsonify(error="Total tagihan harus lebih dari 0."), 400
    if total_bill > MAX_INPUT:
        return jsonify(error=f"Total tagihan maksimal {MAX_INPUT} USD."), 400

    tip = predict_tip(total_bill)
    rmse = METRICS["rmse"]
    return jsonify(
        total_bill=round(total_bill, 2),
        tip=round(tip, 2),
        percent=round(tip / total_bill * 100, 1),
        low=round(max(tip - rmse, 0), 2),
        high=round(tip + rmse, 2),
        out_of_range=bool(total_bill < X_MIN or total_bill > X_MAX),
        intercept=METRICS["intercept"],
        coef=METRICS["coef"],
    )


@app.route("/api/chart-data")
def chart_data():
    points = [
        {"x": float(x), "y": float(y)} for x, y in zip(df["total_bill"], df["tip"])
    ]
    line = [
        {"x": X_MIN, "y": round(predict_tip(X_MIN), 4)},
        {"x": X_MAX, "y": round(predict_tip(X_MAX), 4)},
    ]
    return jsonify(points=points, line=line)


if __name__ == "__main__":
    app.run(debug=True)