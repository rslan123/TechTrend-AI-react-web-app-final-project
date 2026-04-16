פרויקט גמר בקורס פיתוח אפליקציות מובייל — מכללת רופין 2026
רסלאן מחאמיד
מה האפליקציה עושה
TechTrend AI היא אפליקציית ניתוח שוק המניות המשתמשת בלמידת מכונה כדי לייצר איתותי כיוון שעתיים (קנה/מכור/החזק) עבור כל מניה במדד S&P 500. כל תחזית מגיעה עם ציון דיוק מבוסס אימות כך שהמשתמש תמיד יודע האם האיתות הרוויח את הסיווג שלו — או לא.

הרעיון המרכזי: המודל מסרב לתת איתות קנה/מכור אם דיוק האימות שלו נמוך מ-53%, ומחזיר NO_EDGE במקום. זה מה שהופך אותו למעניין טכנית מעבר לאפליקציית CRUD רגילה.

ספריות בשימוש
Frontend — חבילות npm
ספרייה	מטרה
react 18	מסגרת ממשק משתמש מבוססת קומפוננטות
react-dom 18	מרנדר את React לתוך ה-DOM של הדפדפן
react-router-dom v6	ניתוב צד-לקוח, 7 עמודים, ללא טעינה מחדש
recharts	כל הגרפים — LineChart, ComposedChart, Area
axios	קריאות HTTP מהדפדפן לשרת
lucide-react	קומפוננטות אייקון SVG
vite	כלי בנייה ושרת פיתוח
tailwindcss v4	מסגרת CSS כלים
Backend — חבילות npm
ספרייה	מטרה
express	מסגרת שרת Web, מגדיר את כל הנתיבים
cors	מאפשר בקשות דפדפן ממקור שונה
better-sqlite3	מנהל בסיס נתונים SQLite
Python — חבילות
ספרייה	מטרה
yfinance	הורדת נתוני שוק מ-Yahoo Finance
pandas	עיבוד נתונים, פעולות DataFrame
numpy	חישובים מספריים
xgboost	מודל למידת מכונה — Gradient Boosting
scikit-learn	אימות צולב, ניקוד דיוק
joblib	שמירה וטעינה של מודלים מאומנים לדיסק
מבנה הפרויקט
TechTrend-AI/
├── frontend/
│   ├── src/
│   │   ├── App.jsx                ← מעטפת ראשית, ניתוב, ניווט
│   │   ├── main.jsx               ← נקודת כניסה, BrowserRouter
│   │   ├── index.css              ← סגנונות גלובליים + Tailwind
│   │   ├── HomePage.jsx           ← עמוד בית עם Market Strip
│   │   ├── PredictorPage.jsx      ← עמוד התחזית הראשי
│   │   ├── ComparePage.jsx        ← השוואת שתי מניות
│   │   ├── WatchlistPage.jsx      ← רשימת מעקב עם מחירים חיים
│   │   ├── EducationPage.jsx      ← מדרשת השוק האינטראקטיבית
│   │   ├── PredictionLogPage.jsx  ← היסטוריית איתותים
│   │   ├── AboutPage.jsx          ← מידע על הפרויקט
│   │   └── sp500tickers.js        ← רשימת 500 מניות להשלמה אוטומטית
│   ├── index.html
│   └── package.json
│
├── backend/
│   ├── server.js          ← שרת Express, כל הנתיבים
│   ├── database.js        ← הגדרת SQLite
│   ├── predictor.py       ← מנוע ML בפייתון
│   ├── models/            ← מודלי XGBoost שמורים לפי טיקר ותאריך
│   └── prediction_log.csv ← לוג תחזיות אוטומטי
איך האפליקציה עובדת — רמה גבוהה
TechTrend AI היא אפליקציה תלת-שכבתית:

React Frontend — מה שהמשתמש רואה ומשתמש בו
Node/Express Backend — המתווך, מקבל בקשות מ-React ושולח אותן ל-Python
Python ML Engine — עושה את עבודת החיזוי בפועל
