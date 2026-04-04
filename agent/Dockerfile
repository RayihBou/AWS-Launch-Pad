FROM public.ecr.aws/lambda/python:3.12

WORKDIR /app
RUN pip install --no-cache-dir boto3
COPY app.py .

EXPOSE 8080
CMD ["python", "app.py"]
