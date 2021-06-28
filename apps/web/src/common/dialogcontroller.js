import React from "react";
import ReactDOM from "react-dom";
import { hashNavigate } from "../navigation";
import ThemeProvider from "../components/theme-provider";
import { qclone } from "qclone";
import { store as notebookStore } from "../stores/notebook-store";
import { store as appStore } from "../stores/app-store";
import { db } from "./db";
import { showToast } from "../utils/toast";
import { CHECK_IDS } from "notes-core/common";
import { Flex, Text } from "rebass";
import * as Icon from "../components/icons";
import download from "../utils/download";
import { zip } from "../utils/zip";
import Config from "../utils/config";
import Dialogs from "../components/dialogs";

function showDialog(dialog) {
  const root = document.getElementById("dialogContainer");

  if (root) {
    return new Promise((resolve) => {
      const perform = (result) => {
        ReactDOM.unmountComponentAtNode(root);
        hashNavigate("/", { replace: true });
        resolve(result);
      };
      const PropDialog = dialog(Dialogs, perform);
      ReactDOM.render(<ThemeProvider>{PropDialog}</ThemeProvider>, root);
    });
  }
  return Promise.reject("No element with id 'dialogContainer'");
}

export function closeOpenedDialog() {
  const root = document.getElementById("dialogContainer");
  ReactDOM.unmountComponentAtNode(root);
}

export function showEditNotebookDialog(notebookId) {
  const notebook = db.notebooks.notebook(notebookId)?.data;
  if (!notebook) return false;
  return showDialog((Dialogs, perform) => (
    <Dialogs.AddNotebookDialog
      isOpen={true}
      notebook={notebook}
      edit={true}
      onDone={async (nb, deletedTopics) => {
        // we remove the topics from notebook
        // beforehand so we can add them manually, later
        const topics = qclone(nb.topics);
        delete nb.topics;

        let notebookId = await db.notebooks.add(nb);

        // add or delete topics as required
        const notebookTopics = db.notebooks.notebook(notebookId).topics;
        await notebookTopics.delete(...deletedTopics);
        await notebookTopics.add(...topics);

        notebookStore.refresh();
        appStore.refreshMenuPins();

        showToast("success", "Notebook edited successfully!");
        perform(true);
      }}
      onClose={() => {
        perform(false);
      }}
    />
  ));
}

export function showAddNotebookDialog() {
  return showDialog((Dialogs, perform) => (
    <Dialogs.AddNotebookDialog
      isOpen={true}
      onDone={async (nb) => {
        // add the notebook to db
        await db.notebooks.add({ ...nb });
        notebookStore.refresh();

        showToast("success", "Notebook added successfully!");
        perform(true);
      }}
      onClose={() => {
        perform(false);
      }}
    />
  ));
}

export function showBuyDialog(plan, couponCode) {
  return showDialog((Dialogs, perform) => (
    <Dialogs.BuyDialog
      plan={plan}
      couponCode={couponCode}
      onCancel={() => perform(false)}
    />
  ));
}

export function confirm(
  icon,
  { title, subtitle, message, yesText, noText, yesAction }
) {
  return showDialog((Dialogs, perform) => (
    <Dialogs.Confirm
      title={title}
      subtitle={subtitle}
      message={message}
      yesText={yesText}
      noText={noText}
      icon={icon}
      onNo={() => perform(false)}
      onYes={() => {
        if (yesAction) yesAction();
        perform(true);
      }}
    />
  ));
}

export function showMultiDeleteConfirmation(type) {
  let noun = type === "note" ? "notes" : "notebooks";

  return confirm(Icon.Trash, {
    title: `Delete these ${noun}?`,
    message: (
      <Text as="span">
        These {type}s will be{" "}
        <Text as="span" color="primary">
          kept in your Trash for 7 days
        </Text>{" "}
        after which they will be permanently removed.
      </Text>
    ),
    yesText: `Delete these ${type}s`,
    noText: "Cancel",
  });
}

export function showLogoutConfirmation() {
  return confirm(Icon.Logout, {
    title: `Logout?`,
    message:
      "Logging out will delete all local data and reset the app. Make sure you have synced your data before logging out.",
    yesText: `Yes`,
    noText: "No",
  });
}

// export function showAccountDeletedNotice() {
//   return confirm(Icon.Logout, {
//     title: `Account deleted`,
//     message:
//       "You deleted your account from another device. You have been logged out.",
//     yesText: `Okay`,
//   });
// }

// export function showPasswordChangedNotice() {
//   return confirm(Icon.Logout, {
//     title: `Account password changed`,
//     message:
//       "Your account password was changed, please login again using the new password.",
//     yesText: `Okay`,
//   });
// }

export function showAccountLoggedOutNotice(reason) {
  return confirm(Icon.Logout, {
    title: reason,
    message: `You were logged out`,
    yesText: `Okay`,
  });
}

export function showAppUpdatedNotice(version) {
  return confirm(Icon.Update, {
    title: `Welcome to v${version.formatted}`,
    message: (
      <Flex
        flexDirection="column"
        bg="bgSecondary"
        p={1}
        sx={{ borderRadius: "default" }}
      >
        <Text variant="title">Changelog:</Text>
        <Text
          as="pre"
          overflow="auto"
          fontFamily="monospace"
          variant="body"
          mt={1}
        >
          {version.changelog || "No change log."}
        </Text>
      </Flex>
    ),
    yesText: `Yay!`,
  });
}

export function showAppAvailableNotice(version) {
  return confirm(Icon.Update, {
    title: `New version available`,
    message: (
      <Flex
        flexDirection="column"
        bg="bgSecondary"
        p={1}
        sx={{ borderRadius: "default" }}
      >
        <Text variant="title">v{version.formatted} changelog:</Text>
        <Text
          overflow="auto"
          as="pre"
          fontFamily="monospace"
          variant="body"
          mt={1}
          sx={{ overflow: "auto" }}
        >
          {version.changelog || "No change log."}
        </Text>
      </Flex>
    ),
    yesText: `Update now`,
    yesAction: () => window.location.reload(),
  });
}

export function showEmailVerificationDialog() {
  return showDialog((Dialogs, perform) => (
    <Dialogs.EmailVerificationDialog onCancel={() => perform(false)} />
  ));
}

export function showExportDialog(noteIds) {
  return showDialog((Dialogs, perform) => (
    <Dialogs.ExportDialog
      title={
        noteIds.length > 1 ? `Export ${noteIds.length} notes` : "Export note"
      }
      icon={Icon.Export}
      onClose={() => perform(false)}
      exportNote={async (format) => {
        if (format === "pdf") {
          if (noteIds.length > 1)
            showToast("error", "Multiple notes cannot be exported as PDF.");
          const note = db.notes.note(noteIds[0]);
          let result = await exportToPDF(await note.export("html"));
          perform(result);
          return;
        }

        var files = [];
        for (var noteId of noteIds) {
          const note = db.notes.note(noteId);
          const content = await note.export(format);
          if (!content) continue;
          files.push({ filename: note.title, content });
        }
        if (!files.length) return perform(false);
        if (files.length === 1) {
          download(files[0].filename, files[0].content, format);
        } else {
          const zipped = await zip(files, format);
          download("notes", zipped, "zip");
        }
        perform(true);
      }}
    />
  ));
}

async function exportToPDF(content) {
  if (!content) return false;
  return new Promise((resolve) => {
    return import("print-js").then(async ({ default: printjs }) => {
      printjs({
        printable: content,
        type: "raw-html",
        onPrintDialogClose: () => {
          resolve();
        },
      });
      return true;
      // TODO
      // const doc = new jsPDF("p", "px", "letter");
      // const div = document.createElement("div");
      // const { width, height } = doc.internal.pageSize;
      // div.innerHTML = content;
      // div.style.width = width - 80 + "px";
      // div.style.height = height - 80 + "px";
      // div.style.position = "absolute";
      // div.style.top = 0;
      // div.style.left = 0;
      // div.style.margin = "40px";
      // div.style.fontSize = "11px";
      // document.body.appendChild(div);

      // await doc.html(div, {
      //   callback: async (doc) => {
      //     div.remove();
      //     resolve(doc.output());
      //   },
      // });
    });
  });
}

export function showForgotPasswordDialog() {
  return showDialog((Dialogs, perform) => (
    <Dialogs.ForgotPasswordDialog onClose={() => perform()} />
  ));
}

export function showLoadingDialog(dialogData) {
  const { title, message, subtitle, action } = dialogData;
  return showDialog((Dialogs, perform) => (
    <Dialogs.LoadingDialog
      title={title}
      subtitle={subtitle}
      message={message}
      action={action}
      onDone={(e) => perform(e)}
    />
  ));
}

export const showLogInDialog = (
  title,
  description,
  positiveText,
  email,
  skipInit,
  force
) => {
  return showDialog((Dialogs, perform) => (
    <Dialogs.LoginDialog
      title={title}
      description={description}
      positiveText={positiveText}
      skipInit={skipInit}
      force={force}
      email={email}
      onClose={(res) => perform(res)}
    />
  ));
};

export function showMoveNoteDialog(noteIds) {
  return showDialog((Dialogs, perform) => (
    <Dialogs.MoveDialog
      noteIds={noteIds}
      onClose={() => perform(false)}
      onMove={() => perform(true)}
    />
  ));
}

function getDialogData(type) {
  switch (type) {
    case "create_vault":
      return {
        title: "Create Your Vault",
        subtitle: "A vault stores your notes in a password-encrypted storage.",
        positiveButtonText: "Create vault",
      };
    case "lock_note":
      return {
        title: "Lock note",
        subtitle: "Please open your vault to encrypt & lock this note.",
        positiveButtonText: "Lock note",
      };
    case "unlock_note":
      return {
        title: "Unlock note",
        subtitle: "Your note will be unencrypted and removed from the vault.",
        positiveButtonText: "Unlock note",
      };
    case "change_password":
      return {
        title: "Change vault password",
        subtitle:
          "All locked notes will be re-encrypted with the new password.",
        positiveButtonText: "Change password",
      };
    case "change_account_password":
      return {
        title: "Change account password",
        subtitle:
          "All your data will be re-encrypted and synced with the new password.",
        positiveButtonText: "Change password",
      };
    case "delete_account":
      return {
        title: "Delete your account",
        subtitle: (
          <Text as="span" color="error">
            All your data will be permanently deleted with{" "}
            <b>no way of recovery</b>. Proceed with caution.
          </Text>
        ),
        positiveButtonText: "Delete Account",
      };
    default:
      return;
  }
}

export function showPasswordDialog(type, validate) {
  const { title, subtitle, positiveButtonText } = getDialogData(type);
  return showDialog((Dialogs, perform) => (
    <Dialogs.PasswordDialog
      type={type}
      title={title}
      subtitle={subtitle}
      positiveButtonText={positiveButtonText}
      validate={validate}
      onClose={() => perform(false)}
      onDone={() => perform(true)}
    />
  ));
}

export function showRecoveryKeyDialog() {
  return showDialog((Dialogs, perform) => (
    <Dialogs.RecoveryKeyDialog
      onDone={() => {
        Config.set("recoveryKeyBackupDate", Date.now());
        perform(true);
      }}
    />
  ));
}

export function showSignUpDialog() {
  return showDialog((Dialogs, perform) => (
    <Dialogs.SignUpDialog
      onClose={async (res) => {
        perform(res);
        if (res === true) await showRecoveryKeyDialog();
      }}
    />
  ));
}

export function showTopicDialog() {
  return showDialog((Dialogs, perform) => (
    <Dialogs.TopicDialog
      title={"Create a Topic"}
      subtitle={"You can create as many topics as you want."}
      icon={Icon.Topic}
      onClose={() => {
        perform(false);
      }}
      onAction={async (topic) => {
        if (!topic) return;
        const notebookId = notebookStore.get().selectedNotebookId;
        await db.notebooks.notebook(notebookId).topics.add(topic);
        notebookStore.setSelectedNotebook(notebookId);
        perform(true);
      }}
    />
  ));
}

export function showEditTopicDialog(notebookId, topicId) {
  const topic = db.notebooks
    .notebook(notebookId)
    ?.topics?.topic(topicId)?._topic;
  if (!topic) return;
  return showDialog((Dialogs, perform) => (
    <Dialogs.TopicDialog
      title={"Edit Topic"}
      subtitle={`You are editing "${topic.title}" topic.`}
      icon={Icon.Topic}
      topic={topic}
      onClose={() => perform(false)}
      onAction={async (t) => {
        await db.notebooks
          .notebook(topic.notebookId)
          .topics.add({ ...topic, title: t });
        notebookStore.setSelectedNotebook(topic.notebookId);
        showToast("success", "Topic edited successfully!");
        perform(true);
      }}
    />
  ));
}

export function showSessionExpiredDialog(email) {
  return showDialog((Dialogs, perform) => (
    <Dialogs.SessionExpiredDialog
      email={email}
      onClose={(res) => perform(res)}
    />
  ));
}

export function showFeatureDialog(featureName) {
  return showDialog((Dialogs, perform) => (
    <Dialogs.FeatureDialog
      featureName={featureName}
      onClose={(res) => perform(res)}
    />
  ));
}
