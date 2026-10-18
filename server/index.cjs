const runtime = require('./runtime.cjs')();
require('./routes/auth.cjs')(runtime);
require('./routes/attachments.cjs')(runtime);
require('./routes/ops.cjs')(runtime);
require('./routes/events.cjs')(runtime);
require('./routes/help.cjs')(runtime);
require('./services/startup.cjs')(runtime);
