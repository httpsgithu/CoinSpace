import Ractive from 'widgets/modals/base';
import emitter from 'lib/emitter';
import { showInfo, showError } from 'widgets/modals/flash';
import { translate } from 'lib/i18n';
import { unlock, lock } from 'lib/wallet/security';
import content from './_content.ract';

function open(options) {

  const ractive = new Ractive({
    partials: {
      content: options.content || content,
    },
    data: options.data,
  });

  const { wallet } = options;

  ractive.on('send', () => {
    ractive.set('isLoading', true);
    setTimeout(async () => {
      let tx = null;

      try {
        tx = createTx();
      } catch (err) {
        ractive.set('isLoading', false);
        if (/Insufficient funds/.test(err.message)) return showInfo({ title: translate('Insufficient funds') });
        return handleTransactionError(err);
      }

      try {
        await unlock(wallet);
        tx = tx.sign();
        lock(wallet);
      } catch (err) {
        lock(wallet);
        if (err.message !== 'cancelled') console.error(err);
        return ractive.set('isLoading', false);
      }

      try {
        const historyTx = await wallet.sendTx(tx);
        options.onSuccess(ractive);
        // update balance & tx history
        emitter.emit('tx-sent');
        if (historyTx) {
          emitter.emit('append-transactions', [historyTx]);
        }
      } catch (err) {
        return handleTransactionError(err);
      }
    }, 200);
  });

  function createTx() {
    let tx;
    if (options.importTxOptions) {
      tx = wallet.createImportTx(options.importTxOptions);
    } else {
      // eslint-disable-next-line prefer-destructuring
      tx = options.tx;
    }
    return tx;
  }

  function handleTransactionError(err) {
    if (err.message === 'cs-node-error') {
      err.message = translate('Network node error. Please try again later.', { network: wallet.crypto.name });
    } else if (/Gas limit is too low/.test(err.message)) {
      err.message = translate('Please increase the gas limit');
    } else {
      console.error(err);
    }
    showError({
      el: ractive.el,
      title: translate('Transaction Failed'),
      message: err.message,
      fadeInDuration: 0,
    });
  }

  return ractive;
}

export default open;
