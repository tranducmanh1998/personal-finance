import { CategoryManager } from "./category-manager";
import { listCategories } from "@/features/categories/category.service";
import { requireUserId } from "@/lib/dal";

export default async function CategoriesPage() {
  const userId = await requireUserId();
  const categories = await listCategories(userId);

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Thiết lập</p>
          <h1>Danh mục thu chi</h1>
          <p className="muted">
            Tạo danh mục và chọn khoản tiết kiệm tháng để theo dõi riêng.
          </p>
        </div>
      </header>
      <CategoryManager categories={categories} />
    </section>
  );
}
