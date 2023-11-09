/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import Note from "../note";
import Notebook from "../notebook";
import Tag from "../tag";
import TrashItem from "../trash-item";
import { db } from "../../common/db";
import Reminder from "../reminder";
import {
  Context,
  TagsWithDateEdited,
  WithDateEdited,
  NotebooksWithDateEdited
} from "./types";
import { getSortValue } from "@notesnook/core/dist/utils/grouping";
import {
  GroupingKey,
  Item,
  VirtualizedGrouping,
  Color,
  Reminder as ReminderItem
} from "@notesnook/core";
import { useEffect, useRef, useState } from "react";
import SubNotebook from "../sub-notebook";

const SINGLE_LINE_HEIGHT = 1.4;
const DEFAULT_LINE_HEIGHT =
  (document.getElementById("p")?.clientHeight || 16) - 1;
export const DEFAULT_ITEM_HEIGHT = SINGLE_LINE_HEIGHT * 2 * DEFAULT_LINE_HEIGHT;

type ListItemWrapperProps<TItem = Item> = {
  group?: GroupingKey;
  items: VirtualizedGrouping<TItem>;
  id: string;
  context?: Context;
  compact?: boolean;
};

export function ListItemWrapper(props: ListItemWrapperProps) {
  const { id, items, group, compact, context } = props;
  const [item, setItem] = useState<Item>();
  const tags = useRef<TagsWithDateEdited>();
  const notebooks = useRef<NotebooksWithDateEdited>();
  const reminder = useRef<ReminderItem>();
  const color = useRef<Color>();
  const totalNotes = useRef<number>(0);

  useEffect(() => {
    (async function () {
      const { item, data } = (await items.item(id, resolveItems)) || {};
      if (!item) return;
      if (item.type === "note" && isNoteResolvedData(data)) {
        tags.current = data.tags;
        notebooks.current = data.notebooks;
        reminder.current = data.reminder;
        color.current = data.color;
      } else if (item.type === "notebook" && typeof data === "number") {
        totalNotes.current = data;
      } else if (item.type === "tag" && typeof data === "number") {
        totalNotes.current = data;
      }
      setItem(item);
    })();
  }, [id, items]);

  if (!item)
    return <div style={{ height: DEFAULT_ITEM_HEIGHT, width: "100%" }} />;

  const { type } = item;
  switch (type) {
    case "note": {
      return (
        <Note
          compact={compact}
          item={item}
          tags={tags.current}
          color={color.current}
          notebooks={notebooks.current}
          reminder={reminder.current}
          date={getDate(item, group)}
          context={context}
        />
      );
    }
    case "notebook":
      if (context?.type === "notebook")
        return (
          <SubNotebook
            item={item}
            totalNotes={totalNotes.current}
            notebookId={context.id}
          />
        );

      return (
        <Notebook
          item={item}
          totalNotes={totalNotes.current}
          date={getDate(item, group)}
        />
      );
    case "trash":
      return <TrashItem item={item} date={getDate(item, type)} />;
    case "reminder":
      return <Reminder item={item} />;
    case "tag":
      return <Tag item={item} totalNotes={totalNotes.current} />;
    default:
      return null;
  }
}

function withDateEdited<
  T extends { dateEdited: number } | { dateModified: number }
>(items: T[]): WithDateEdited<T> {
  let latestDateEdited = 0;
  items.forEach((item) => {
    const date = "dateEdited" in item ? item.dateEdited : item.dateModified;
    if (latestDateEdited < date) latestDateEdited = date;
  });
  return { dateEdited: latestDateEdited, items };
}

function getDate(item: Item, groupType?: GroupingKey): number {
  return (
    getSortValue(
      groupType
        ? db.settings.getGroupOptions(groupType)
        : {
            groupBy: "default",
            sortBy: "dateEdited",
            sortDirection: "desc"
          },
      item
    ) || 0
  );
}

export async function resolveItems(ids: string[], items: Record<string, Item>) {
  const { type } = items[ids[0]];
  if (type === "note") return resolveNotes(ids);
  else if (type === "notebook") {
    const data: Record<string, number> = {};
    for (const id of ids) data[id] = await db.notebooks.totalNotes(id);
    return data;
  } else if (type === "tag") {
    const data: Record<string, number> = {};
    for (const id of ids)
      data[id] = await db.relations.from({ id, type: "tag" }, "note").count();
    return data;
  }
  return {};
}

type NoteResolvedData = {
  notebooks?: NotebooksWithDateEdited;
  reminder?: ReminderItem;
  color?: Color;
  tags?: TagsWithDateEdited;
};
async function resolveNotes(ids: string[]) {
  console.time("relations");
  const relations = [
    ...(await db.relations
      .to({ type: "note", ids }, ["notebook", "tag", "color"])
      .get()),
    ...(await db.relations.from({ type: "note", ids }, "reminder").get())
  ];
  console.timeEnd("relations");
  console.log(
    relations,
    ids,
    await db.relations
      .from({ type: "notebook", id: "6549b4c373c7f3a40852f80c" }, "note")
      .get()
  );
  const relationIds: {
    notebooks: Set<string>;
    colors: Set<string>;
    tags: Set<string>;
    reminders: Set<string>;
  } = {
    colors: new Set(),
    notebooks: new Set(),
    tags: new Set(),
    reminders: new Set()
  };

  const grouped: Record<
    string,
    {
      notebooks: string[];
      color?: string;
      tags: string[];
      reminder?: string;
    }
  > = {};
  for (const relation of relations) {
    const noteId =
      relation.toType === "relation" ? relation.fromId : relation.toId;
    const data = grouped[noteId] || {
      notebooks: [],
      tags: []
    };

    if (relation.toType === "relation" && !data.reminder) {
      data.reminder = relation.fromId;
      relationIds.reminders.add(relation.fromId);
    } else if (relation.fromType === "notebook" && data.notebooks.length < 2) {
      data.notebooks.push(relation.fromId);
      relationIds.notebooks.add(relation.fromId);
    } else if (relation.fromType === "tag" && data.tags.length < 3) {
      data.tags.push(relation.fromId);
      relationIds.tags.add(relation.fromId);
    } else if (relation.fromType === "color" && !data.color) {
      data.color = relation.fromId;
      relationIds.colors.add(relation.fromId);
    }
    grouped[relation.toId] = data;
  }

  console.time("resolve");
  const resolved = {
    notebooks: await db.notebooks.all.records(
      Array.from(relationIds.notebooks)
    ),
    tags: await db.tags.all.records(Array.from(relationIds.tags)),
    colors: await db.colors.all.records(Array.from(relationIds.colors)),
    reminders: await db.reminders.all.records(Array.from(relationIds.reminders))
  };
  console.timeEnd("resolve");

  const data: Record<string, NoteResolvedData> = {};
  for (const noteId in grouped) {
    const group = grouped[noteId];
    data[noteId] = {
      color: group.color ? resolved.colors[group.color] : undefined,
      reminder: group.reminder ? resolved.reminders[group.reminder] : undefined,
      tags: withDateEdited(group.tags.map((id) => resolved.tags[id])),
      notebooks: withDateEdited(
        group.notebooks.map((id) => resolved.notebooks[id])
      )
    };
  }
  return data;
}

function isNoteResolvedData(data: unknown): data is NoteResolvedData {
  return (
    typeof data === "object" &&
    !!data &&
    "notebooks" in data &&
    "reminder" in data &&
    "color" in data &&
    "tags" in data
  );
}
