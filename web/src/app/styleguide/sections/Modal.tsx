import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Modal = () => (
  <section>
    <h2 className="mb-2 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
      Modal
    </h2>
    <p className="mb-6 text-[13px] text-muted-foreground">
      파괴적 작업 확정용 AlertDialog와 편집 흐름용 일반 Dialog 두 종류를 제공한다.
    </p>

    <div className="space-y-6">
      <div className="rounded-md border border-subtle bg-elevated p-6">
        <h3 className="mb-2 text-sm font-medium text-foreground">AlertDialog</h3>
        <p className="mb-4 text-[13px] text-muted-foreground">
          예: 관심종목 그룹 삭제 — 그룹 내 종목이 다른 그룹에도 없는 경우 함께 제거되므로 확정 절차가 필요하다.
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              그룹 삭제
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>그룹 &ldquo;기술주&rdquo;를 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                그룹에 속한 종목 중 다른 그룹에도 없는 종목은 관심종목에서 함께 제거됩니다.
                이 작업은 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction>삭제</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <p className="mt-4 text-[11px] text-muted-foreground">
          확정 버튼은 default variant로 둔다 — destructive 토큰의 빨강이 price-up 색과 시각적으로 겹쳐서다.
        </p>
      </div>

      <div className="rounded-md border border-subtle bg-elevated p-6">
        <h3 className="mb-2 text-sm font-medium text-foreground">Dialog</h3>
        <p className="mb-4 text-[13px] text-muted-foreground">
          예: 편집 흐름 컨테이너 — 그룹 관리처럼 본문에 입력·리스트 UI를 담는 경우. 오버레이 클릭과 Esc로 닫을 수 있고, 우상단 닫기(X) 버튼이 포함된다.
        </p>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              관심종목 그룹 관리
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>관심종목 그룹 관리</DialogTitle>
              <DialogDescription>
                그룹 추가·이름 변경·순서 변경과 그룹 내 종목 편집을 한 곳에서 진행합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-subtle bg-background px-4 py-6 text-[13px] text-muted-foreground">
              본문 영역 — 실제 그룹 편집 UI가 들어갈 자리입니다.
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">
                  취소
                </Button>
              </DialogClose>
              <Button size="sm">저장</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <p className="mt-4 text-[11px] text-muted-foreground">
          저장은 default 버튼, 취소는 outline + DialogClose로 모달 dismiss. 우상단 X 버튼은 본문 내부 컴포넌트가 별도로 처리하지 않아도 dismiss가 동작한다.
        </p>
      </div>
    </div>
  </section>
);
