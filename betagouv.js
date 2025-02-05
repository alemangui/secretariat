// betagouv.js
// ======
const Promise = require('bluebird');
const https = require('https');
const rp = require('request-promise');
const ovh = require('ovh')({
  appKey: process.env.OVH_APP_KEY,
  appSecret: process.env.OVH_APP_SECRET,
  consumerKey: process.env.OVH_CONSUMER_KEY
});

const config = {
  domain: process.env.SECRETARIAT_DOMAIN || 'beta.gouv.fr',
  usersAPI:
    process.env.USERS_API || 'https://beta.gouv.fr/api/v1.6/authors.json',
  slackWebhookURL: process.env.SLACK_WEBHOOK_URL
};

const betaOVH = {
  emailInfos: async name => {
    const url = `/email/domain/${config.domain}/account/${name}`;

    try {
      return await ovh.requestPromised('GET', url, {});
    } catch (err) {
      if (err.error == '404') return null;

      throw new Error(`OVH Error GET on ${url} : ${JSON.stringify(err)}`);
    }
  },
  createEmail: async (name, password) => {
    const url = `/email/domain/${config.domain}/account`;

    try {
      console.log(`OVH POST ${url} name=${name}`);

      return await ovh.requestPromised('POST', url, {
        accountName: name,
        password
      });
    } catch (err) {
      throw new Error(`OVH Error POST on ${url} : ${JSON.stringify(err)}`);
    }
  },
  createRedirection: async (from, to, localCopy) => {
    const url = `/email/domain/${config.domain}/redirection`;

    try {
      console.log(`OVH POST ${url} from+${from} &to=${to}`);

      return await ovh.requestPromised('POST', url, { from, to, localCopy });
    } catch (err) {
      throw new Error(`OVH Error POST on ${url} : ${JSON.stringify(err)}`);
    }
  },
  requestRedirection: async (method, redirectionId) =>
    ovh.requestPromised(
      method,
      `/email/domain/${config.domain}/redirection/${redirectionId}`
    ),
  requestRedirections: async (method, redirectionIds) =>
    Promise.map(redirectionIds, redirectionId =>
      BetaGouv.requestRedirection(method, redirectionId)
    ),
  redirectionsForName: async query => {
    if (!query.from && !query.to) {
      throw new Error(`paramètre 'from' ou 'to' manquant`);
    }

    const url = `/email/domain/${config.domain}/redirection`;

    const options = {};

    if (query.from) {
      options.from = `${query.from}@beta.gouv.fr`;
    }

    if (query.to) {
      options.to = `${query.to}@beta.gouv.fr`;
    }

    try {
      const redirectionIds = await ovh.requestPromised('GET', url, options);

      return await BetaGouv.requestRedirections('GET', redirectionIds);
    } catch (err) {
      throw new Error(`OVH Error on ${url} : ${JSON.stringify(err)}`);
    }
  },
  deleteRedirection: async (from, to) => {
    const url = `/email/domain/${config.domain}/redirection`;

    try {
      const redirectionIds = await ovh.requestPromised('GET', url, {
        from,
        to
      });

      return await BetaGouv.requestRedirections('DELETE', redirectionIds);
    } catch (err) {
      throw new Error(`OVH Error on deleting ${url} : ${JSON.stringify(err)}`);
    }
  },
  redirections: async () => {
    const url = `/email/domain/${config.domain}/redirection`;

    try {
      const redirectionIds = await ovh.requestPromised('GET', url);

      return await BetaGouv.requestRedirections('GET', redirectionIds);
    } catch (err) {
      throw new Error(`OVH Error on ${url} : ${JSON.stringify(err)}`);
    }
  },
  accounts: async () => {
    const url = `/email/domain/${config.domain}/account`;

    try {
      return await ovh.requestPromised('GET', url, {});
    } catch (err) {
      if (err.error != '404') {
        throw new Error(`OVH Error GET on ${url} : ${JSON.stringify(err)}`);
      }
      return null;
    }
  },
  changePassword: async (id, password) => {
    const url = `/email/domain/${config.domain}/account/${id}/changePassword`;

    try {
      await ovh.requestPromised('POST', url, { password });
    } catch (err) {
      throw new Error(`OVH Error on ${url} : ${JSON.stringify(err)}`);
    }
  }
};

const BetaGouv = {
  sendInfoToSlack: async text => {
    try {
      const options = {
        method: 'POST',
        uri: config.slackWebhookURL,
        body: { text },
        json: true
      };

      return await rp(options);
    } catch (err) {
      throw new Error(`Error to notify slack: ${err}`);
    }
  },
  ...betaOVH,
  usersInfos: async () =>
    new Promise((resolve, reject) =>
      // TODO: utiliser `fetch` avec header accept:application/json
      // pour ne pas avoir à gérer les chunks + JSON.parse
      https
        .get(config.usersAPI, resp => {
          let data = '';

          resp.on('data', chunk => (data += chunk));
          resp.on('end', () => resolve(JSON.parse(data)));
        })
        .on('error', err => {
          reject(`Error to get users infos in beta.gouv.fr: ${err}`);
        })
    ),
  userInfosById: async id => {
    const users = await BetaGouv.usersInfos();

    return users.find(element => element.id == id);
  }
};

module.exports = BetaGouv;
