import type { PricedItem } from '../../shared/types';
import { CONFIDENCE_LABEL, displayName, formatPrice, rarityClass } from '../format';

interface Props {
  data: PricedItem;
  currency: 'chaos' | 'divine';
  divine: number | null;
  active: boolean;
  onClick(): void;
}

export function ItemCard({ data, currency, divine, active, onClick }: Props) {
  const { item, price } = data;
  const { title, subtitle } = displayName(item);
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(data.firstSeen)) / 60000));
  return (
    <button className={`card ${rarityClass(item)} ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="card-icon">{item.icon ? <img src={item.icon} alt="" loading="lazy" /> : null}</div>
      <div className="card-body">
        <div className="card-title">{title}</div>
        {subtitle && <div className="card-sub">{subtitle}</div>}
        <div className="card-meta">
          <span className={`conf ${price.confidence}`} title={CONFIDENCE_LABEL[price.confidence]} />
          <span>{price.source === 'none' ? 'brak wyceny' : price.source}</span>
          <span>· {minutes === 0 ? 'teraz' : `${minutes} min temu`}</span>
        </div>
      </div>
      <div className="card-price">
        <div className="price">{formatPrice(price.chaos, currency, divine)}</div>
        {price.low != null && price.high != null && price.low !== price.high && (
          <div className="range">{formatPrice(price.low, currency, divine)}–{formatPrice(price.high, currency, divine)}</div>
        )}
      </div>
    </button>
  );
}
