import { AssetForm } from "./asset-form";
import { requireUserId } from "@/lib/dal";
import { getLatestAssetBalances } from "@/features/dashboard/dashboard.repository";

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export default async function AssetsPage() {
  const userId = await requireUserId();
  const balances = await getLatestAssetBalances(userId);

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Tài sản</p>
          <h1>Số dư tài sản</h1>
          <p className="muted">
            Nhập số dư thực tế theo ngày chốt. Mỗi ngày chỉ lưu một số dư cho
            từng loại tài sản.
          </p>
        </div>
      </header>
      <div className="content-card">
        <h2>Cập nhật số dư</h2>
        <AssetForm today={localDate()} balances={balances} />
      </div>
    </section>
  );
}
