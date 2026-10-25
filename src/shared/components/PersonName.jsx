import { splitPersonName } from '../lib/person-name.js';
import './person-name.css';

export default function PersonName({ value, stacked = false, mentorLabel = false }) {
  const { name, mentors } = splitPersonName(value);
  const names = mentorLabel ? [...new Set(mentors.join('').slice(1, -1).split(/[，,、]/u).map(mentor => mentor.trim()).filter(Boolean))] : [];
  const details = mentorLabel ? names.map((mentor, index) => `${index === 0 ? '导师：' : ''}${mentor}${index < names.length - 1 ? '、' : ''}`) : mentors;
  return <span className={`platform-person-name${stacked ? ' is-stacked' : ''}`}>
    <span className="platform-person-primary">{name}</span>
    {!!details.length && <span className="platform-person-mentors">{details.map((mentor, index) => <span key={index}>{mentor}</span>)}</span>}
  </span>;
}
