import pymysql

try:
    conn = pymysql.connect(host='127.0.0.1', port=3306, user='obdet', password='obdet2024', database='object_detection')
    cursor = conn.cursor()
    cursor.execute("DESCRIBE detections;")
    columns = [row[0] for row in cursor.fetchall()]
    if 'acknowledged' not in columns:
        cursor.execute("ALTER TABLE detections ADD COLUMN acknowledged BOOLEAN DEFAULT FALSE;")
        conn.commit()
        print("Coluna acknowledged adicionada com sucesso.")
    else:
        print("Coluna já existe.")
except Exception as e:
    print(f"Erro: {e}")
