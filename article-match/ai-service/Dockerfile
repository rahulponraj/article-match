FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 U2NET_HOME=/models HF_HOME=/models
RUN pip install --no-cache-dir torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
# bake models into the image so cold starts are fast
RUN python -c "import pipeline; pipeline.load()"
EXPOSE 7860
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","7860"]
