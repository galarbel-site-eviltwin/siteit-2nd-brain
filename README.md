# SiteIt 2nd Brain

המוח הארגוני של סייט איט: זיכרון משותף ושיחה טבעית מעל המידע של החברה, הלקוחות והפרויקטים.

## מסמכים
- [docs/product-spec.md](docs/product-spec.md) - אפיון המוצר (החזון)
- [docs/decisions.md](docs/decisions.md) - הכרעות על השאלות הפתוחות ופיצ'רים שנוספו (קובע כשיש סתירה)
- [docs/technical-spec.md](docs/technical-spec.md) - אפיון טכני וסדר הבנייה בפאזות
- [docs/mockup/index.html](docs/mockup/index.html) - מוקאפ מסכים אינטראקטיבי (כניסה, היום שלי, שאל את המוח, לקוחות, מרחב לקוח, קליטת מידע, ידע החברה, לבדיקה, ניהול). לפתוח דרך שרת מקומי: `npx http-server docs/mockup -p 4321`
- [docs/design-prompts/](docs/design-prompts/) - פרומפטים ל-Claude Design

## הרצה מקומית
```bash
npm install
npm run dev
```
נפתח ב-`http://localhost:3000`. הערכים הסודיים יושבים ב-`.env.local` (לא ב-git). התבנית ב-`.env.example`.

| פקודה | מה עושה |
|---|---|
| `npm run db:generate` | מייצר מיגרציה מהסכמה (`src/lib/db/schema.ts`) |
| `npm run db:migrate` | מריץ מיגרציות מול Supabase (דרך ה-session pooler) |
| `npm run db:seed` | טוען את רשימת העובדים המאושרים. בטוח להריץ שוב |
| `npm run typecheck` | בדיקת טיפוסים |

## מצב
**שלב 0.** בענן: https://siteit-2nd-brain.vercel.app (פרנקפורט). בדיקת תקינות: `/api/health`. כניסה לפי רשימת עובדים, מסד נתונים ב-Supabase (סגור ל-API הציבורי), יומן כניסות ועמוד ניהול לדני. כניסה עם Google (אפליקציה פנימית לארגון eviltwin.io). במחשב המקומי יש גם כניסה זמנית בלי Google.
