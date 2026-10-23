import { formatDate } from "../../app/formatters.js";
import { formatPublicNumber } from "../lib/public-number.js";
import { reviewTeacherName } from "../lib/review-scope.js";
import PersonName from './PersonName.jsx';

export default function RequestIdentity({ row }) {
  return (
    <div className="platform-request-identity">
      <div className="platform-request-reference">
        <span>{formatPublicNumber(row.public_id)}</span>
        <time dateTime={row.created_at}>
          提交于 {formatDate(row.created_at)}
        </time>
      </div>
      <div className="platform-request-people">
        <span>
          <small>申请人</small>
          <strong className="platform-identity">
            <PersonName value={row.applicant_name || row.applicant_username} />
          </strong>
        </span>
        <span>
          <small>审核教师</small>
          <strong className="platform-identity">
            <PersonName value={reviewTeacherName(row)} />
          </strong>
        </span>
      </div>
    </div>
  );
}
