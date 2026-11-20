import type { PricedItem } from '../../shared/types';
import { trend } from '../../core/extras/history';
import { CONFIDENCE_LABEL, displayName, formatPrice, rarityClass } from '../format';
import { TrendBadge } from './Sparkline';

interface Props {
  data: PricedItem;
  currency: 'chaos' | 'divine';
  divine: number | null;
  active: boolean;
  belowMin?: boolean;
  minValue?: number;
  onClick(): void;
}

export function ItemCard({ data, currency, divine, active, belowMin, minValue, onClick }: Props) {
  const { item, price, advice } = data;
  const { title, subtitle } = displayName(item);
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(data.firstSeen)) / 60000));
  const change = price.change7d ?? trend(data.history);
  return (
    <button className={`card ${rarityClass(item)} ${active ? 'active' : ''} ${belowMin ? 'below' : ''}`} onClick={onClick}>
      {belowMin && <span className="below-tag" title={`Wartość poniżej ${minValue}c`}>{price.chaos == null ? 'bez ceny' : `< ${minValue}c`}</span>}
      <div className="card-icon">{item.icon ? <img src={item.icon} alt="" loading="lazy" /> : null}</div>
      <div className="card-body">
        <div className="card-title">{title}</div>
        {subtitle && <div className="card-sub">{subtitle}</div>}
        <div className="card-meta">
          <span className={`conf ${price.confidence}`} title={CONFIDENCE_LABEL[price.confidence]} />
          <span>{price.source === 'none' ? 'brak wyceny' : price.source}</span>
          <span>· {minutes === 0 ? 'teraz' : minutes < 120 ? `${minutes} min temu` : `${Math.round(minutes / 60)} h temu`}</span>
        </div>
        {advice && <span className={`advice ${advice.action}`} title={advice.reason}>{advice.label}</span>}
      </div>
      <div className="card-price">
        <div className="price">{formatPrice(price.chaos, currency, divine)}</div>
        {price.low != null && price.high != null && price.low !== price.high && (
          <div className="range">{formatPrice(price.low, currency, divine)}–{formatPrice(price.high, currency, divine)}</div>
        )}
        <TrendBadge change={change} />
      </div>
    </button>
  );
}
