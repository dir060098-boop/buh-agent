FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       tesseract-ocr \
       tesseract-ocr-rus \
       wget \
    && (apt-get install -y --no-install-recommends tesseract-ocr-kir || true) \
    && rm -rf /var/lib/apt/lists/*

# Fallback: download Kyrgyz tessdata from GitHub if apt package unavailable
RUN if ! tesseract --list-langs 2>/dev/null | grep -q '^kir$'; then \
      TESSDATA=$(find /usr/share/tesseract-ocr -name "eng.traineddata" -exec dirname {} \; | head -1) && \
      wget -q -O "$TESSDATA/kir.traineddata" \
        "https://github.com/tesseract-ocr/tessdata/raw/main/kir.traineddata"; \
    fi

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads

CMD uvicorn main:app --host 0.0.0.0 --port $PORT
