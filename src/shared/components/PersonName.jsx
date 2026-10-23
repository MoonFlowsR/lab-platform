import { splitPersonName } from '../lib/person-name.js';
import './person-name.css';

export default function PersonName({ value, stacked = false }) {
  const { name, mentors } = splitPersonName(value);
  return <span className={`platform-person-name${stacked ? ' is-stacked' : ''}`}>
    <span className="platform-person-primary">{name}</span>
    {!!mentors.length && <span className="platform-person-mentors">{mentors.map((mentor, index) => <span key={index}>{mentor}</span>)}</span>}
  </span>;
}
