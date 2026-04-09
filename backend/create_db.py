import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

conn_url = os.getenv("DATABASE_URL", "")
if "admin:admin" not in conn_url:
    print("Please use the correct credentials.")

try:
    conn = pymysql.connect(host='127.0.0.1', user='admin', password='admin')
    cursor = conn.cursor()
    cursor.execute('CREATE DATABASE IF NOT EXISTS object_detection')
    conn.commit()
    conn.close()
    print("Database `object_detection` checked/created successfully.")
except Exception as e:
    print(f"Could not connect to MySQL to create DB: {e}")
